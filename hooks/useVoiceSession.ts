import { fetchAuthSession } from "aws-amplify/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	AudioContext,
	AudioManager,
	AudioRecorder,
} from "react-native-audio-api";

const WS_URL = "ws://13.43.104.139:8080";
const SAMPLE_RATE = 16000;
const BUFFER_DURATION = 0.1;
const BUFFER_LENGTH = SAMPLE_RATE * BUFFER_DURATION;

export type VoiceSessionTranscript = { role: string; text: string };

export type VoiceSessionStep =
	| "idle"
	| "connecting"
	| "listening"
	| "speaking"
	| "error";

async function getCognitoToken(): Promise<string> {
	const session = await fetchAuthSession();
	const token = session.tokens?.idToken?.toString();
	if (!token) throw new Error("No Cognito token available");
	return token;
}

export function useVoiceSession() {
	const ws = useRef<WebSocket | null>(null);
	const recorder = useRef<AudioRecorder | null>(null);
	const audioCtx = useRef<AudioContext | null>(null);
	const nextPlayTime = useRef(0);

	const [step, setStep] = useState<VoiceSessionStep>("idle");
	const [transcripts, setTranscripts] = useState<VoiceSessionTranscript[]>(
		[],
	);
	const [error, setError] = useState<string | null>(null);

	const float32ToInt16Buffer = useCallback(
		(float32: Float32Array, frames: number): ArrayBuffer => {
			const int16 = new Int16Array(frames);
			for (let i = 0; i < frames; i++) {
				const s = Math.max(-1, Math.min(1, float32[i]));
				int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
			}
			return int16.buffer;
		},
		[],
	);

	const int16ToFloat32 = useCallback((buf: ArrayBuffer): Float32Array => {
		const int16 = new Int16Array(buf);
		const float32 = new Float32Array(int16.length);
		for (let i = 0; i < int16.length; i++) {
			float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7fff);
		}
		return float32;
	}, []);

	const playPcmChunk = useCallback(
		(pcmBuffer: ArrayBuffer) => {
			const ctx = audioCtx.current;
			if (!ctx) return;

			const float32 = int16ToFloat32(pcmBuffer);
			if (float32.length === 0) return;

			const audioBuffer = ctx.createBuffer(
				1,
				float32.length,
				SAMPLE_RATE,
			);
			audioBuffer.copyToChannel(float32, 0);

			const source = ctx.createBufferSource();
			source.buffer = audioBuffer;
			source.connect(ctx.destination);

			const now = ctx.currentTime;
			const startAt = Math.max(now, nextPlayTime.current);
			source.start(startAt);
			nextPlayTime.current = startAt + audioBuffer.duration;
		},
		[int16ToFloat32],
	);

	const connect = useCallback(
		async (options?: { voiceId?: string; systemPrompt?: string }) => {
			setStep("connecting");
			setError(null);
			setTranscripts([]);
			nextPlayTime.current = 0;

			try {
				const token = await getCognitoToken();

				await AudioManager.setAudioSessionOptions({
					iosCategory: "playAndRecord",
					iosMode: "default",
					iosOptions: [],
				});

				audioCtx.current = new AudioContext({
					sampleRate: SAMPLE_RATE,
				});

				recorder.current = new AudioRecorder();
				recorder.current.onAudioReady(
					{
						sampleRate: SAMPLE_RATE,
						bufferLength: BUFFER_LENGTH,
						channelCount: 1,
					},
					({ buffer, numFrames }) => {
						if (ws.current?.readyState === WebSocket.OPEN) {
							console.log("enter");
							const channelData = buffer.getChannelData(0);
							const pcm = float32ToInt16Buffer(
								channelData,
								numFrames,
							);
							ws.current.send(pcm);
						}
					},
				);

				const socket = new WebSocket(
					`${WS_URL}?token=${encodeURIComponent(token)}`,
				);
				socket.binaryType = "arraybuffer";

				socket.onopen = () => {
					console.log("WebSocket connected");
					socket.send(
						JSON.stringify({
							type: "session_start",
							voiceId: options?.voiceId,
							systemPrompt: options?.systemPrompt,
						}),
					);
					startMic();
				};

				socket.onmessage = (evt) => {
					console.log("Received message:", evt.data);
					if (typeof evt.data === "string") {
						const msg = JSON.parse(evt.data);
						if (msg.type === "transcript") {
							setTranscripts((prev) => [
								...prev,
								{ role: msg.role, text: msg.text },
							]);
							if (msg.role === "ASSISTANT") {
								setStep("speaking");
							} else if (msg.role === "USER") {
								setStep("listening");
							}
						} else if (msg.type === "error") {
							setError(msg.message);
							setStep("error");
						}
					} else {
						playPcmChunk(evt.data);
					}
				};

				socket.onclose = () => {
					setStep("idle");
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

	const startMic = useCallback(async () => {
		const perms = await AudioManager.requestRecordingPermissions();
		if (perms !== "Granted") {
			setError("Microphone permission required");
			setStep("error");
			return;
		}
		await AudioManager.setAudioSessionActivity(true);
		const result = recorder.current?.start();
		if (result?.status === "error") {
			setError(result.message);
			setStep("error");
			return;
		}
		setStep("listening");
	}, []);

	const disconnect = useCallback(() => {
		recorder.current?.clearOnAudioReady();
		recorder.current?.stop();
		AudioManager.setAudioSessionActivity(false);
		if (ws.current?.readyState === WebSocket.OPEN) {
			ws.current.send(JSON.stringify({ type: "audio_end" }));
		}
		ws.current?.close();
		ws.current = null;
		audioCtx.current = null;
		recorder.current = null;
		setStep("idle");
	}, []);

	useEffect(() => {
		return () => {
			recorder.current?.clearOnAudioReady();
			recorder.current?.stop();
			ws.current?.close();
		};
	}, []);

	return {
		step,
		transcripts,
		error,
		connect,
		disconnect,
	};
}
