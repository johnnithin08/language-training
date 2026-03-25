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
const {
	KinesisVideoClient,
	GetSignalingChannelEndpointCommand,
} = require("@aws-sdk/client-kinesis-video");
const {
	KinesisVideoSignalingClient,
	GetIceServerConfigCommand,
} = require("@aws-sdk/client-kinesis-video-signaling");
const { nonstandard, RTCPeerConnection } = require("wrtc");
const fs = require("fs");

if (fs.existsSync("/app/relay.env")) {
	for (const line of fs.readFileSync("/app/relay.env", "utf8").split("\n")) {
		const m = line.match(/^([A-Z_]+)=(.+)$/);
		if (m) process.env[m[1]] = m[2];
	}
}

const BEDROCK_REGION = process.env.BEDROCK_REGION || "eu-north-1";
const KVS_REGION = process.env.KVS_REGION || "eu-west-2";
const MODEL_ID = process.env.MODEL_ID || "amazon.nova-sonic-v1:0";
const PORT = parseInt(process.env.PORT || "8080", 10);
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const APP_CLIENT_ID = process.env.COGNITO_APP_CLIENT_ID;
const KVS_CHANNEL_ARN = process.env.KVS_CHANNEL_ARN;

if (!USER_POOL_ID) {
	console.error("COGNITO_USER_POOL_ID is required");
	process.exit(1);
}
if (!KVS_CHANNEL_ARN) {
	console.error("KVS_CHANNEL_ARN is required");
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
	region: BEDROCK_REGION,
	requestHandler: new NodeHttp2Handler({
		requestTimeout: 300_000,
		sessionTimeout: 300_000,
		disableConcurrentStreams: false,
		maxConcurrentStreams: 20,
	}),
});

const kinesisVideo = new KinesisVideoClient({ region: KVS_REGION });

let cachedIceServers = null;
let iceServersExpiry = 0;

async function getIceServers() {
	if (cachedIceServers && Date.now() < iceServersExpiry) {
		return cachedIceServers;
	}

	const endpointResp = await kinesisVideo.send(
		new GetSignalingChannelEndpointCommand({
			ChannelARN: KVS_CHANNEL_ARN,
			SingleMasterChannelEndpointConfiguration: {
				Protocols: ["HTTPS"],
				Role: "MASTER",
			},
		}),
	);

	const httpsEndpoint = endpointResp.ResourceEndpointList.find(
		(e) => e.Protocol === "HTTPS",
	).ResourceEndpoint;

	const signalingClient = new KinesisVideoSignalingClient({
		region: KVS_REGION,
		endpoint: httpsEndpoint,
	});

	const iceResp = await signalingClient.send(
		new GetIceServerConfigCommand({ ChannelARN: KVS_CHANNEL_ARN }),
	);

	const iceServers = [
		{ urls: "stun:stun.l.google.com:19302" },
		...iceResp.IceServerList.map((s) => ({
			urls: s.Uris,
			username: s.Username,
			credential: s.Password,
		})),
	];

	cachedIceServers = iceServers;
	iceServersExpiry = Date.now() + 4 * 60 * 1000;

	console.log(`Fetched ${iceServers.length} ICE servers (cached 4 min)`);
	return iceServers;
}

const SILENCE_FRAME = Buffer.alloc(1600).toString("base64");

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

	let peerConnection = null;
	let audioSource = null;
	let active = false;
	const audioQueue = [];
	let resolveAudio = null;

	const recordedChunks = [];
	const aiTranscripts = [];

	const promptName = randomUUID();
	const systemContentName = randomUUID();
	const audioContentName = randomUUID();
	const assistantAudioContentNames = new Set();

	let systemPrompt =
		"You are a friendly language practice partner. " +
		"Keep replies concise and natural for spoken conversation.";
	let voiceId = "tiffany";

	clientWs.on("message", async (data, isBinary) => {
		if (isBinary) return;

		const msg = JSON.parse(data.toString());

		if (msg.type === "session_start") {
			if (msg.systemPrompt) systemPrompt = msg.systemPrompt;
			if (msg.voiceId) voiceId = msg.voiceId;

			try {
				const iceServers = await getIceServers();
				clientWs.send(
					JSON.stringify({ type: "ice_servers", iceServers }),
				);
			} catch (err) {
				console.error("Failed to get ICE servers:", err.message);
				clientWs.send(
					JSON.stringify({
						type: "error",
						message: "Failed to get ICE servers",
					}),
				);
			}
		} else if (msg.type === "sdp_offer") {
			await handleSdpOffer(msg.sdp);
		} else if (msg.type === "ice_candidate") {
			if (peerConnection && msg.candidate) {
				try {
					await peerConnection.addIceCandidate(msg.candidate);
				} catch (err) {
					console.error("Failed to add ICE candidate:", err.message);
				}
			}
		} else if (msg.type === "end_session") {
			await handleEndSession();
		}
	});

	clientWs.on("close", () => {
		active = false;
		if (resolveAudio) resolveAudio();
		cleanupPeerConnection();
		console.log("Client disconnected");
	});

	function cleanupPeerConnection() {
		if (peerConnection) {
			peerConnection.close();
			peerConnection = null;
		}
		audioSource = null;
	}

	async function handleSdpOffer(sdp) {
		try {
			const iceServers = await getIceServers();

			audioSource = new nonstandard.RTCAudioSource({ sampleRate: 16000 });
			const audioTrack = audioSource.createTrack();

			peerConnection = new RTCPeerConnection({
				iceServers,
				sdpSemantics: "unified-plan",
			});

			peerConnection.addTrack(audioTrack);

			peerConnection.onicecandidate = ({ candidate }) => {
				if (candidate && clientWs.readyState === WebSocket.OPEN) {
					clientWs.send(
						JSON.stringify({
							type: "ice_candidate",
							candidate,
						}),
					);
				}
			};

			peerConnection.ontrack = (event) => {
				console.log("Received client audio track");
				const sink = new nonstandard.RTCAudioSink(event.track);
				let frameCount = 0;

				sink.ondata = (audioData) => {
					if (!active) return;

					const { samples, sampleRate, channelCount } = audioData;

					let pcm16k;
					if (sampleRate === 48000) {
						const mono =
							channelCount === 2
								? mixToMono(samples, channelCount)
								: samples;
						pcm16k = downsample(mono, sampleRate, 16000);
					} else if (sampleRate === 16000) {
						pcm16k =
							channelCount === 2
								? mixToMono(samples, channelCount)
								: samples;
					} else {
						const mono =
							channelCount === 2
								? mixToMono(samples, channelCount)
								: samples;
						pcm16k = downsample(mono, sampleRate, 16000);
					}

					const pcmBuffer = Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength);

					recordedChunks.push(pcmBuffer);

					audioQueue.push(pcmBuffer.toString("base64"));
					if (resolveAudio) resolveAudio();

					frameCount++;
					if (frameCount % 100 === 1) {
						console.log(
							`WebRTC audio: ${frameCount} frames, src=${sampleRate}Hz ch=${channelCount} -> 16kHz mono (queue: ${audioQueue.length})`,
						);
					}
				};
			};

			const pc = peerConnection;
			peerConnection.onconnectionstatechange = () => {
				if (!pc) return;
				console.log(
					"PeerConnection state:",
					pc.connectionState,
				);
				if (
					pc.connectionState === "connected" &&
					!active
				) {
					startBedrockSession();
				}
			};

			await peerConnection.setRemoteDescription({
				type: "offer",
				sdp,
			});

			const answer = await peerConnection.createAnswer();
			await peerConnection.setLocalDescription(answer);

			clientWs.send(
				JSON.stringify({
					type: "sdp_answer",
					sdp: answer.sdp,
				}),
			);
		} catch (err) {
			console.error("WebRTC setup error:", err);
			clientWs.send(
				JSON.stringify({
					type: "error",
					message: "WebRTC setup failed: " + err.message,
				}),
			);
		}
	}

	async function handleEndSession() {
		console.log("Session ending, starting analysis...");
		active = false;
		if (resolveAudio) resolveAudio();

		clientWs.send(JSON.stringify({ type: "analyzing" }));

		cleanupPeerConnection();

		try {
			const analysisJson = await runAnalysisPass();
			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.send(
					JSON.stringify({ type: "analysis", data: analysisJson }),
				);
			}
		} catch (err) {
			console.error("Analysis failed:", err);
			if (clientWs.readyState === WebSocket.OPEN) {
				clientWs.send(
					JSON.stringify({
						type: "error",
						message: "Analysis failed: " + err.message,
					}),
				);
			}
		}

		recordedChunks.length = 0;
		aiTranscripts.length = 0;
	}

	const FRAMES_PER_PUSH = 160;
	let outputBuffer = new Int16Array(0);

	function pushAudioToClient(pcmBase64) {
		if (!audioSource) return;
		const pcm = Buffer.from(pcmBase64, "base64");
		const newSamples = new Int16Array(
			pcm.buffer,
			pcm.byteOffset,
			pcm.length / 2,
		);

		const combined = new Int16Array(outputBuffer.length + newSamples.length);
		combined.set(outputBuffer);
		combined.set(newSamples, outputBuffer.length);

		let offset = 0;
		while (offset + FRAMES_PER_PUSH <= combined.length) {
			const chunk = combined.slice(offset, offset + FRAMES_PER_PUSH);
			audioSource.onData({
				samples: chunk,
				sampleRate: 16000,
				bitsPerSample: 16,
				channelCount: 1,
				numberOfFrames: FRAMES_PER_PUSH,
			});
			offset += FRAMES_PER_PUSH;
		}

		outputBuffer = combined.slice(offset);
	}

	async function* generateInputStream() {
		const enc = new TextEncoder();
		const send = (obj) => ({
			chunk: { bytes: enc.encode(JSON.stringify(obj)) },
		});

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
						pushAudioToClient(evt.audioOutput.content);
					} else if (evt.textOutput) {
						const transcript = {
							role: evt.textOutput.role,
							text: evt.textOutput.content,
						};
						clientWs.send(
							JSON.stringify({
								type: "transcript",
								...transcript,
							}),
						);
						aiTranscripts.push(transcript);
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

	// --- Post-session analysis via second Nova Sonic pass ---

	async function runAnalysisPass() {
		const analysisPromptName = randomUUID();
		const analysisSystemName = randomUUID();
		const analysisContextName = randomUUID();
		const analysisAudioName = randomUUID();

		const aiTranscriptText = aiTranscripts
			.map((t) => `${t.role}: ${t.text}`)
			.join("\n");

		const analysisSystemPrompt = buildAnalysisPrompt(aiTranscriptText);

		const collectedText = [];

		async function* generateAnalysisInput() {
			const enc = new TextEncoder();
			const send = (obj) => ({
				chunk: { bytes: enc.encode(JSON.stringify(obj)) },
			});

			yield send({
				event: {
					sessionStart: {
						inferenceConfiguration: {
							maxTokens: 4096,
							topP: 0.9,
							temperature: 0.3,
						},
					},
				},
			});

			yield send({
				event: {
					promptStart: {
						promptName: analysisPromptName,
						textOutputConfiguration: {
							mediaType: "text/plain",
						},
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

			yield send({
				event: {
					contentStart: {
						promptName: analysisPromptName,
						contentName: analysisSystemName,
						type: "TEXT",
						interactive: false,
						role: "SYSTEM",
						textInputConfiguration: {
							mediaType: "text/plain",
						},
					},
				},
			});
			yield send({
				event: {
					textInput: {
						promptName: analysisPromptName,
						contentName: analysisSystemName,
						content: analysisSystemPrompt,
					},
				},
			});
			yield send({
				event: {
					contentEnd: {
						promptName: analysisPromptName,
						contentName: analysisSystemName,
					},
				},
			});

			yield send({
				event: {
					contentStart: {
						promptName: analysisPromptName,
						contentName: analysisAudioName,
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

			for (const chunk of recordedChunks) {
				yield send({
					event: {
						audioInput: {
							promptName: analysisPromptName,
							contentName: analysisAudioName,
							content: chunk.toString("base64"),
						},
					},
				});
			}

			yield send({
				event: {
					contentEnd: {
						promptName: analysisPromptName,
						contentName: analysisAudioName,
					},
				},
			});
			yield send({
				event: { promptEnd: { promptName: analysisPromptName } },
			});
			yield send({ event: { sessionEnd: {} } });
		}

		const command = new InvokeModelWithBidirectionalStreamCommand({
			modelId: MODEL_ID,
			body: generateAnalysisInput(),
		});

		const response = await bedrock.send(command);

		for await (const event of response.body) {
			if (event.chunk?.bytes) {
				const json = JSON.parse(
					new TextDecoder().decode(event.chunk.bytes),
				);
				const evt = json.event;
				if (!evt) continue;

				if (evt.textOutput) {
					collectedText.push(evt.textOutput.content);
				}
			}
		}

		const fullText = collectedText.join("");
		console.log("Analysis raw output:", fullText.slice(0, 500));

		const jsonStart = fullText.indexOf("{");
		const jsonEnd = fullText.lastIndexOf("}");
		if (jsonStart === -1 || jsonEnd === -1) {
			throw new Error("Analysis did not return JSON");
		}
		return JSON.parse(fullText.slice(jsonStart, jsonEnd + 1));
	}
});

function buildAnalysisPrompt(aiTranscriptText) {
	return `You are an expert English language assessor. You are about to hear a recording of a language learner practicing spoken English.

The AI assistant's side of the conversation is provided below as text for context. Analyze ONLY the learner's speech — do not evaluate the assistant.

### CONVERSATION CONTEXT (AI assistant responses):
${aiTranscriptText}

### YOUR TASK:
Listen carefully to the learner's audio and provide a structured assessment.

### SCORING CRITERIA (0-10):

grammar:
- Correct use of tense, sentence structure, and agreement

fluency:
- Natural flow, speaking pace, hesitations, filler words, and ease of expression

pronunciation:
- Accent clarity, word-level pronunciation accuracy, intonation patterns, and stress placement

vocabulary:
- Range and appropriateness of vocabulary

coherence:
- Logical connection of ideas and clarity across sentences

overall:
- Balanced average of the above scores

### ALSO PROVIDE:
- cefr_level (A1, A2, B1, B2, C1, or C2)
- strengths (3-5 short bullet points)
- weaknesses (3-5 short bullet points)
- common_mistakes (list repeated or important mistakes)
- corrected_examples (up to 5): Each item: { "original": "...", "corrected": "..." }
- suggestions (3-5 actionable tips)

### RULES:
- Be consistent and objective
- Score conservatively (avoid scores above 8 unless clearly advanced)
- Focus on patterns, not one-off mistakes
- Be constructive and encouraging
- For pronunciation: comment on specific sounds, stress patterns, or intonation issues
- Output a single compact JSON object only (no markdown fences, no preamble, no closing remarks)

### OUTPUT FORMAT (STRICT):
Return ONLY valid JSON (nothing else before or after):

{
  "scores": {
    "grammar": number,
    "fluency": number,
    "pronunciation": number,
    "vocabulary": number,
    "coherence": number,
    "overall": number
  },
  "cefr_level": "B1",
  "strengths": [],
  "weaknesses": [],
  "common_mistakes": [],
  "corrected_examples": [],
  "suggestions": []
}`;
}

function downsample(samples, fromRate, toRate) {
	const ratio = fromRate / toRate;
	const outLength = Math.floor(samples.length / ratio);
	const out = new Int16Array(outLength);
	for (let i = 0; i < outLength; i++) {
		out[i] = samples[Math.floor(i * ratio)];
	}
	return out;
}

function mixToMono(samples, channelCount) {
	const frames = samples.length / channelCount;
	const mono = new Int16Array(frames);
	for (let i = 0; i < frames; i++) {
		let sum = 0;
		for (let ch = 0; ch < channelCount; ch++) {
			sum += samples[i * channelCount + ch];
		}
		mono[i] = Math.round(sum / channelCount);
	}
	return mono;
}

server.listen(PORT, () =>
	console.log(`Nova Sonic relay listening on :${PORT}`),
);
