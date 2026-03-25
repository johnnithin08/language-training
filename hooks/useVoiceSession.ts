import { fetchAuthSession } from "aws-amplify/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	RTCIceCandidate,
	RTCPeerConnection,
	RTCSessionDescription,
	mediaDevices,
	type MediaStream as RNMediaStream,
} from "react-native-webrtc";

const WS_URL = "ws://13.43.104.139:8080";

export type VoiceSessionTranscript = { role: string; text: string };

export type VoiceSessionStep =
	| "idle"
	| "connecting"
	| "listening"
	| "speaking"
	| "analyzing"
	| "error";

export type VoiceSessionAnalysis = {
	scores: {
		grammar: number;
		fluency: number;
		pronunciation: number;
		vocabulary: number;
		coherence: number;
		overall: number;
	};
	cefr_level: string;
	strengths: string[];
	weaknesses: string[];
	common_mistakes: string[];
	corrected_examples: { original: string; corrected: string }[];
	suggestions: string[];
};

async function getCognitoToken(): Promise<string> {
	const session = await fetchAuthSession();
	const token = session.tokens?.idToken?.toString();
	if (!token) throw new Error("No Cognito token available");
	return token;
}

export function useVoiceSession() {
	const ws = useRef<WebSocket | null>(null);
	const pc = useRef<RTCPeerConnection | null>(null);
	const localStream = useRef<RNMediaStream | null>(null);

	const [step, setStep] = useState<VoiceSessionStep>("idle");
	const [transcripts, setTranscripts] = useState<VoiceSessionTranscript[]>(
		[],
	);
	const [error, setError] = useState<string | null>(null);
	const [analysis, setAnalysis] = useState<VoiceSessionAnalysis | null>(null);

	const connect = useCallback(
		async (options?: { voiceId?: string; systemPrompt?: string }) => {
			setStep("connecting");
			setError(null);
			setTranscripts([]);
			setAnalysis(null);

			try {
				const token = await getCognitoToken();
				const socket = new WebSocket(
					`${WS_URL}?token=${encodeURIComponent(token)}`,
				);

				socket.onopen = () => {
					console.log("WebSocket connected");
					socket.send(
						JSON.stringify({
							type: "session_start",
							voiceId: options?.voiceId,
							systemPrompt: options?.systemPrompt,
						}),
					);
				};

				socket.onmessage = async (evt) => {
					if (typeof evt.data !== "string") return;

					const msg = JSON.parse(evt.data);
					console.log("WS:", msg.type);

					if (msg.type === "ice_servers") {
						await setupWebRTC(socket, msg.iceServers);
					} else if (msg.type === "sdp_answer") {
						if (pc.current) {
							await pc.current.setRemoteDescription(
								new RTCSessionDescription({
									type: "answer",
									sdp: msg.sdp,
								}),
							);
						}
					} else if (msg.type === "ice_candidate") {
						if (pc.current && msg.candidate) {
							await pc.current.addIceCandidate(
								new RTCIceCandidate(msg.candidate),
							);
						}
					} else if (msg.type === "ai_audio_start") {
						setStep("speaking");
					} else if (msg.type === "ai_audio_end") {
						setStep("listening");
					} else if (msg.type === "barge_in") {
						console.log("Barge-in detected");
						setStep("listening");
					} else if (msg.type === "transcript") {
						setTranscripts((prev) => [
							...prev,
							{ role: msg.role, text: msg.text },
						]);
					} else if (msg.type === "analyzing") {
						setStep("analyzing");
					} else if (msg.type === "analysis") {
						setAnalysis(msg.data);
						setStep("idle");
					} else if (msg.type === "error") {
						setError(msg.message);
						setStep("error");
					}
				};

				socket.onclose = () => {
					if (step !== "analyzing") {
						setStep("idle");
					}
				};

				socket.onerror = () => {
					setError("Connection lost");
					setStep("error");
				};

				ws.current = socket;
			} catch (e) {
				const msg =
					e instanceof Error ? e.message : "Could not connect";
				setError(msg);
				setStep("error");
			}
		},
		[],
	);

	async function setupWebRTC(socket: WebSocket, iceServers: RTCIceServer[]) {
		try {
			const stream = (await mediaDevices.getUserMedia({
				audio: true,
				video: false,
			})) as RNMediaStream;
			localStream.current = stream;

			const peerConnection = new RTCPeerConnection({
				iceServers,
			});

			stream.getTracks().forEach((track) => {
				peerConnection.addTrack(track, stream);
			});

			peerConnection.onicecandidate = (event) => {
				if (event.candidate && socket.readyState === WebSocket.OPEN) {
					socket.send(
						JSON.stringify({
							type: "ice_candidate",
							candidate: event.candidate,
						}),
					);
				}
			};

			peerConnection.ontrack = (event) => {
				console.log("Received remote audio track (AI voice)");
			};

			peerConnection.onconnectionstatechange = () => {
				const state = peerConnection.connectionState;
				console.log("WebRTC connection state:", state);
				if (state === "connected") {
					setStep("listening");
				} else if (state === "failed" || state === "disconnected") {
					setError("WebRTC connection lost");
					setStep("error");
				}
			};

			const offer = await peerConnection.createOffer({
				offerToReceiveAudio: true,
				offerToReceiveVideo: false,
			});
			await peerConnection.setLocalDescription(offer);

			socket.send(
				JSON.stringify({
					type: "sdp_offer",
					sdp: offer.sdp,
				}),
			);

			pc.current = peerConnection;
		} catch (err) {
			console.error("WebRTC setup error:", err);
			setError(
				"Microphone access failed: " +
					(err instanceof Error ? err.message : String(err)),
			);
			setStep("error");
		}
	}

	const disconnect = useCallback(() => {
		if (ws.current?.readyState === WebSocket.OPEN) {
			ws.current.send(JSON.stringify({ type: "end_session" }));
		}

		if (localStream.current) {
			localStream.current.getTracks().forEach((t) => t.stop());
			localStream.current = null;
		}

		if (pc.current) {
			pc.current.close();
			pc.current = null;
		}
	}, []);

	useEffect(() => {
		return () => {
			localStream.current?.getTracks().forEach((t) => t.stop());
			pc.current?.close();
			ws.current?.close();
		};
	}, []);

	return {
		step,
		transcripts,
		error,
		analysis,
		connect,
		disconnect,
	};
}
