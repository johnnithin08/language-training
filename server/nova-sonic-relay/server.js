const http = require("http");
const { randomUUID } = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const {
	BedrockRuntimeClient,
	InvokeModelWithBidirectionalStreamCommand,
} = require("@aws-sdk/client-bedrock-runtime");
const { NodeHttp2Handler } = require("@smithy/node-http-handler");
const fs = require("fs");

if (fs.existsSync("/app/relay.env")) {
	for (const line of fs.readFileSync("/app/relay.env", "utf8").split("\n")) {
		const m = line.match(/^([A-Z_]+)=(.+)$/);
		if (m) process.env[m[1]] = m[2];
	}
}

const REGION = process.env.AWS_REGION || "eu-north-1";
const MODEL_ID = process.env.MODEL_ID || "amazon.nova-sonic-v1:0";
const PORT = parseInt(process.env.PORT || "8080", 10);
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;

if (!USER_POOL_ID) {
	console.error("COGNITO_USER_POOL_ID is required");
	process.exit(1);
}

const poolRegion = USER_POOL_ID.split("_")[0];
const issuer = `https://cognito-idp.${poolRegion}.amazonaws.com/${USER_POOL_ID}`;
const jwks = jwksClient({
	jwksUri: `${issuer}/.well-known/jwks.json`,
	cache: true,
	cacheMaxAge: 600000,
});

function getSigningKey(header, callback) {
	jwks.getSigningKey(header.kid, (err, key) => {
		if (err) return callback(err);
		callback(null, key.getPublicKey());
	});
}

function verifyCognitoToken(token) {
	return new Promise((resolve, reject) => {
		const options = { issuer, algorithms: ["RS256"] };
		if (APP_CLIENT_ID) options.audience = APP_CLIENT_ID;
		jwt.verify(token, getSigningKey, options, (err, decoded) => {
			if (err) return reject(err);
			resolve(decoded);
		});
	});
}

const bedrock = new BedrockRuntimeClient({
	region: REGION,
	requestHandler: new NodeHttp2Handler({
		requestTimeout: 300_000,
		sessionTimeout: 300_000,
		disableConcurrentStreams: false,
		maxConcurrentStreams: 20,
	}),
});

const server = http.createServer((_req, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("nova-sonic-relay ok");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", async (req, socket, head) => {
	try {
		const url = new URL(req.url, `http://${req.headers.host}`);
		const token = url.searchParams.get("token");
		if (!token) throw new Error("Missing token");
		await verifyCognitoToken(token);
		wss.handleUpgrade(req, socket, head, (ws) =>
			wss.emit("connection", ws, req),
		);
	} catch (err) {
		console.error("Auth failed:", err.message);
		socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
		socket.destroy();
	}
});

wss.on("connection", (clientWs) => {
	console.log("Client connected");

	let active = false;
	const audioQueue = [];
	let resolveAudio = null;

	const promptName = randomUUID();
	const systemContentName = randomUUID();
	const audioContentName = randomUUID();

	const assistantAudioContentNames = new Set();

	// 50ms of silence at 16kHz 16-bit mono = 800 samples = 1600 bytes of zeros.
	// Sent as keepalive when no real audio is in the queue.
	const SILENCE_FRAME = Buffer.alloc(1600).toString("base64");

	let systemPrompt =
		"You are a friendly language practice partner. " +
		"Keep replies concise and natural for spoken conversation.";
	let voiceId = "tiffany";

	let audioFrameCount = 0;
	clientWs.on("message", (data, isBinary) => {
		if (!isBinary) {
			const msg = JSON.parse(data.toString());

			if (msg.type === "session_start") {
				if (msg.systemPrompt) systemPrompt = msg.systemPrompt;
				if (msg.voiceId) voiceId = msg.voiceId;
				startBedrockSession();
			} else if (msg.type === "audio_end") {
				active = false;
				if (resolveAudio) resolveAudio();
			}
		} else {
			audioQueue.push(Buffer.from(data).toString("base64"));
			if (resolveAudio) resolveAudio();
			audioFrameCount++;
			if (audioFrameCount % 50 === 1) {
				console.log(`Client audio: received ${audioFrameCount} frames (queue: ${audioQueue.length})`);
			}
		}
	});

	clientWs.on("close", () => {
		active = false;
		if (resolveAudio) resolveAudio();
		console.log("Client disconnected");
	});

	async function* generateInputStream() {
		const enc = new TextEncoder();
		const send = (obj) => ({
			chunk: { bytes: enc.encode(JSON.stringify(obj)) },
		});

		// --- Session start ---
		yield send({
			event: {
				sessionStart: {
					inferenceConfiguration: {
						maxTokens: 1024,
						topP: 0.9,
						temperature: 0.7,
					},
				},
			},
		});

		// --- Prompt start ---
		yield send({
			event: {
				promptStart: {
					promptName,
					textOutputConfiguration: { mediaType: "text/plain" },
					audioOutputConfiguration: {
						mediaType: "audio/lpcm",
						sampleRateHertz: 16000,
						sampleSizeBits: 16,
						channelCount: 1,
						voiceId,
						encoding: "base64",
						audioType: "SPEECH",
					},
				},
			},
		});

		// --- System prompt (TEXT, SYSTEM) ---
		yield send({
			event: {
				contentStart: {
					promptName,
					contentName: systemContentName,
					type: "TEXT",
					interactive: false,
					role: "SYSTEM",
					textInputConfiguration: { mediaType: "text/plain" },
				},
			},
		});
		yield send({
			event: {
				textInput: {
					promptName,
					contentName: systemContentName,
					content: systemPrompt,
				},
			},
		});
		yield send({
			event: {
				contentEnd: { promptName, contentName: systemContentName },
			},
		});

		// --- Interactive user audio stream ---
		yield send({
			event: {
				contentStart: {
					promptName,
					contentName: audioContentName,
					type: "AUDIO",
					interactive: true,
					role: "USER",
					audioInputConfiguration: {
						mediaType: "audio/lpcm",
						sampleRateHertz: 16000,
						sampleSizeBits: 16,
						channelCount: 1,
						audioType: "SPEECH",
						encoding: "base64",
					},
				},
			},
		});

		active = true;
		while (active) {
			if (audioQueue.length > 0) {
				const pcmBase64 = audioQueue.shift();
				yield send({
					event: {
						audioInput: {
							promptName,
							contentName: audioContentName,
							content: pcmBase64,
						},
					},
				});
			} else {
				await new Promise((r) => {
					resolveAudio = r;
					setTimeout(r, 50);
				});
				if (active && audioQueue.length === 0) {
					yield send({
						event: {
							audioInput: {
								promptName,
								contentName: audioContentName,
								content: SILENCE_FRAME,
							},
						},
					});
				}
			}
		}

		yield send({
			event: {
				contentEnd: { promptName, contentName: audioContentName },
			},
		});
		yield send({ event: { promptEnd: { promptName } } });
		yield send({ event: { sessionEnd: {} } });
	}

	async function startBedrockSession() {
		try {
			const command = new InvokeModelWithBidirectionalStreamCommand({
				modelId: MODEL_ID,
				body: generateInputStream(),
			});

			const response = await bedrock.send(command);

			for await (const event of response.body) {
				if (clientWs.readyState !== WebSocket.OPEN) break;

				if (event.chunk?.bytes) {
					const json = JSON.parse(
						new TextDecoder().decode(event.chunk.bytes),
					);
					const evt = json.event;
					if (!evt) continue;

					const evtType = Object.keys(evt)[0];
					if (evtType !== "audioOutput") {
						console.log(
							"Bedrock event:",
							evtType,
							JSON.stringify(evt[evtType]).slice(0, 200),
						);
					}

					if (evt.contentStart) {
						if (
							evt.contentStart.type === "AUDIO" &&
							evt.contentStart.role === "ASSISTANT"
						) {
							assistantAudioContentNames.add(
								evt.contentStart.contentName,
							);
							clientWs.send(
								JSON.stringify({ type: "ai_audio_start" }),
							);
						}
					} else if (evt.audioOutput) {
						const pcm = Buffer.from(
							evt.audioOutput.content,
							"base64",
						);
						clientWs.send(pcm);
					} else if (evt.textOutput) {
						clientWs.send(
							JSON.stringify({
								type: "transcript",
								role: evt.textOutput.role,
								text: evt.textOutput.content,
							}),
						);
					} else if (evt.contentEnd) {
						const cn = evt.contentEnd.contentName;
						if (assistantAudioContentNames.has(cn)) {
							assistantAudioContentNames.delete(cn);
							clientWs.send(
								JSON.stringify({ type: "ai_audio_end" }),
							);
						}
						if (evt.contentEnd.stopReason === "INTERRUPTED") {
							console.log("User barge-in detected");
							clientWs.send(
								JSON.stringify({ type: "barge_in" }),
							);
						}
					}
				} else if (event.modelStreamErrorException) {
					console.error(
						"Model stream error:",
						event.modelStreamErrorException,
					);
					clientWs.send(
						JSON.stringify({
							type: "error",
							message:
								event.modelStreamErrorException.message ||
								"Model stream error",
						}),
					);
				} else if (event.internalServerException) {
					console.error(
						"Internal server error:",
						event.internalServerException,
					);
					clientWs.send(
						JSON.stringify({
							type: "error",
							message:
								event.internalServerException.message ||
								"Internal server error",
						}),
					);
				}
			}
		} catch (err) {
			console.error("Bedrock stream error:", err);
			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.send(
					JSON.stringify({ type: "error", message: err.message }),
				);
			}
		}
	}
});

server.listen(PORT, () =>
	console.log(`Nova Sonic relay listening on :${PORT}`),
);
