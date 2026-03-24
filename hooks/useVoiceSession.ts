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

// RMS above this while AI is speaking → treat as user barge-in, not echo.
// After iOS AEC, residual echo is typically ~0.01-0.03 RMS;
// real speech close to the mic is ~0.08+.
const ENERGY_THRESHOLD = 0.05;

export type VoiceSessionTranscript = { role: string; text: string };

export type VoiceSessionStep =
	| "idle"
	| "connecting"
	| "listening"
	| "speaking"
	| "error";

function computeRMS(samples: Float32Array, frames: number): number {
	let sum = 0;
	for (let i = 0; i < frames; i++) {
		sum += samples[i] * samples[i];
	}
	return Math.sqrt(sum / frames);
}

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
	const gainNode = useRef<GainNode | null>(null);
	const nextPlayTime = useRef(0);
	const aiSpeaking = useRef(true);
	const echoSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
			const gain = gainNode.current;
			if (!ctx || !gain) return;

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
			source.connect(gain);

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

				aiSpeaking.current = true;

				await AudioManager.setAudioSessionOptions({
					iosCategory: "playAndRecord",
					iosMode: "voiceChat",
					iosOptions: [],
				});

				const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
				audioCtx.current = ctx;

				const gain = ctx.createGain();
				gain.connect(ctx.destination);
				gainNode.current = gain;

				recorder.current = new AudioRecorder();
				recorder.current.onAudioReady(
					{
						sampleRate: SAMPLE_RATE,
						bufferLength: BUFFER_LENGTH,
						channelCount: 1,
					},
					({ buffer, numFrames }) => {
						const channelData = buffer.getChannelData(0);

						if (aiSpeaking.current) {
							const rms = computeRMS(channelData, numFrames);
							if (rms < ENERGY_THRESHOLD) return;
							// User is speaking over the AI (barge-in) —
							// silence playback so only the user's voice matters.
							if (gainNode.current) {
								gainNode.current.gain.value = 0;
							}
						}

						if (ws.current?.readyState === WebSocket.OPEN) {
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
					if (typeof evt.data === "string") {
						const msg = JSON.parse(evt.data);
						if (msg.type === "ai_audio_start") {
							aiSpeaking.current = true;
							if (echoSettleTimer.current) {
								clearTimeout(echoSettleTimer.current);
								echoSettleTimer.current = null;
							}
							if (gainNode.current) {
								gainNode.current.gain.value = 1;
							}
							nextPlayTime.current = 0;
							setStep("speaking");
						} else if (msg.type === "ai_audio_end") {
							echoSettleTimer.current = setTimeout(() => {
								aiSpeaking.current = false;
								if (gainNode.current) {
									gainNode.current.gain.value = 1;
								}
								nextPlayTime.current = 0;
								setStep("listening");
							}, 200);
						} else if (msg.type === "transcript") {
							setTranscripts((prev) => [
								...prev,
								{ role: msg.role, text: msg.text },
							]);
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
		[float32ToInt16Buffer, playPcmChunk],
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
		}
	}, []);

	const disconnect = useCallback(() => {
		if (echoSettleTimer.current) {
			clearTimeout(echoSettleTimer.current);
			echoSettleTimer.current = null;
		}
		aiSpeaking.current = true;
		recorder.current?.clearOnAudioReady();
		recorder.current?.stop();
		AudioManager.setAudioSessionActivity(false);
		if (ws.current?.readyState === WebSocket.OPEN) {
			ws.current.send(JSON.stringify({ type: "audio_end" }));
		}
		ws.current?.close();
		ws.current = null;
		audioCtx.current = null;
		gainNode.current = null;
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
