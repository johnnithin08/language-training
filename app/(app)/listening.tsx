import { app, colors, white } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import { getAssistantReply } from "@/services/assistant-reply";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoice, VoiceMode } from "react-native-voicekit";

type FlowPhase = "idle" | "thinking" | "speaking";

export default function ListeningScreen() {
	const router = useRouter();
	const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
	const { userData } = useAuth();
	const insets = useSafeAreaInsets();
	const [error, setError] = useState<string | null>(null);
	const [flow, setFlow] = useState<FlowPhase>("idle");
	const [lastReplyText, setLastReplyText] = useState<string | null>(null);
	const lastSubmittedRef = useRef<string | null>(null);
	const completedRef = useRef(false);

	const {
		available,
		listening,
		transcript,
		startListening,
		stopListening,
		resetTranscript,
	} = useVoice({
		locale: "en-US",
		mode: VoiceMode.ContinuousAndStop,
		silenceTimeoutMs: 2000,
		enablePartialResults: false,
	});

	useEffect(() => {
		let active = true;
		const beginListening = async () => {
			try {
				if (!available) return;
				setError(null);
				setFlow("idle");
				resetTranscript();
				await startListening();
			} catch {
				if (active) {
					setError("Could not start listening. Please try again.");
				}
			}
		};
		beginListening();
		return () => {
			active = false;
			void stopListening();
			void Speech.stop();
		};
	}, [available]);

	useEffect(() => {
		if (listening) {
			lastSubmittedRef.current = null;
			return;
		}
		const text = transcript.trim();
		if (!text) return;
		if (lastSubmittedRef.current === text) return;
		lastSubmittedRef.current = text;
		completedRef.current = false;
		let cancelled = false;

		const run = async () => {
			setFlow("thinking");
			setError(null);
			try {
				const reply = await getAssistantReply(
					[{ role: "user", content: text }],
					{
						targetLanguage: userData?.targetLanguage,
						categoryId: categoryId ?? undefined,
					},
				);
				if (cancelled) return;
				completedRef.current = true;
				setLastReplyText(reply);
				setFlow("speaking");
				await Speech.stop();
				Speech.speak(reply, {
					language: "en-US",
					rate: 0.95,
					pitch: 1.0,
					onDone: () => {
						if (cancelled) return;
						resetTranscript();
						setFlow("idle");
						void startListening();
					},
					onStopped: () => {
						setFlow("idle");
					},
					onError: () => {
						setFlow("idle");
					},
				});
			} catch (e) {
				console.error("Error in assistant reply flow", e);
				if (cancelled) return;
				const msg =
					e instanceof Error ? e.message : "Could not reach the AI.";
				setError(msg);
				setFlow("idle");
				lastSubmittedRef.current = null;
			}
		};

		void run();
		return () => {
			cancelled = true;
			if (!completedRef.current) {
				lastSubmittedRef.current = null;
			}
		};
	}, [listening, transcript, userData?.targetLanguage, categoryId]);

	const transcriptText = transcript.trim();
	const utteranceCaptured = !listening && transcriptText.length > 0;

	const statusTitle = useMemo(() => {
		if (!available) return "Voice not available";
		if (error) return "Something went wrong";
		if (flow === "thinking") return "Thinking...";
		if (flow === "speaking") return "Speaking...";
		return listening ? "Listening..." : "Waiting...";
	}, [available, error, flow, listening]);

	const statusSubtitle = useMemo(() => {
		if (!available)
			return "Speech recognition is not available on this device";
		if (error) return error;
		if (flow === "thinking") return "Asking Claude on Amazon Bedrock";
		if (flow === "speaking") return "Playing the assistant reply";
		return "Tell the AI something";
	}, [available, error, flow]);

	const helperText = useMemo(() => {
		if (flow === "thinking") return "Hang tight";
		if (utteranceCaptured)
			return "Auto-stopped after you finished speaking";
		return "Speak naturally - No pressure";
	}, [flow, utteranceCaptured]);

	const assistantBoxText = useMemo(() => {
		if (flow === "thinking") return "…";
		if (flow === "speaking" && lastReplyText?.trim()) return lastReplyText;
		return "Reply will appear here";
	}, [flow, lastReplyText]);

	const canReplay = (lastReplyText?.length ?? 0) > 0 && flow === "idle";

	const handleReplayLastReply = async () => {
		const text = lastReplyText;
		if (!text || flow !== "idle") return;
		await Speech.stop();
		setFlow("speaking");
		Speech.speak(text, {
			language: "en-US",
			rate: 0.95,
			pitch: 1.0,
			onDone: () => setFlow("idle"),
			onStopped: () => setFlow("idle"),
			onError: () => setFlow("idle"),
		});
	};

	const replayDisabled = !canReplay || flow !== "idle";

	return (
		<View
			style={[
				styles.container,
				{
					paddingTop: insets.top + 12,
					paddingBottom: insets.bottom + 16,
					paddingLeft: insets.left + 20,
					paddingRight: insets.right + 20,
				},
			]}
		>
			<Pressable
				style={styles.closeButton}
				onPress={() => router.back()}
				hitSlop={10}
			>
				<Ionicons name="close" size={24} color={white} />
			</Pressable>

			<View style={styles.content}>
				<LinearGradient
					colors={[...app.iconGradient]}
					style={styles.micGradient}
				>
					<Ionicons name="mic-outline" size={54} color={white} />
				</LinearGradient>

				<Text style={styles.title}>{statusTitle}</Text>
				<Text style={styles.subtitle}>{statusSubtitle}</Text>
				<Text style={styles.helper}>{helperText}</Text>
				{categoryId ? (
					<Text style={styles.category}>Category: {categoryId}</Text>
				) : null}
				<Text style={styles.transcriptLabel}>You</Text>
				<View style={styles.transcriptBox}>
					<Text style={styles.transcriptText}>
						{transcriptText.length > 0
							? transcript
							: "Start speaking..."}
					</Text>
				</View>

				<Text style={styles.transcriptLabel}>Assistant</Text>
				<View style={styles.transcriptBox}>
					<Text style={styles.transcriptText}>
						{assistantBoxText}
					</Text>
				</View>

				<Pressable
					style={({ pressed }) => [
						styles.speakButton,
						pressed && styles.speakButtonPressed,
						replayDisabled && styles.speakButtonDisabled,
					]}
					onPress={() => void handleReplayLastReply()}
					disabled={replayDisabled}
				>
					<Ionicons
						name="volume-high"
						size={22}
						color={white}
						style={styles.speakIcon}
					/>
					<Text style={styles.speakButtonText}>
						{flow === "speaking"
							? "Speaking…"
							: "Replay last reply"}
					</Text>
				</Pressable>

				<View style={styles.waveWrap}>
					<View style={[styles.waveBar, { height: 18 }]} />
					<View style={[styles.waveBar, { height: 26 }]} />
					<View style={[styles.waveBar, { height: 14 }]} />
					<View style={[styles.waveBar, { height: 34 }]} />
					<View style={[styles.waveBar, { height: 22 }]} />
				</View>
			</View>

			<Pressable
				style={({ pressed }) => [
					styles.skipButton,
					pressed && styles.skipButtonPressed,
				]}
				onPress={() => router.replace("/(app)")}
			>
				<Text style={styles.skipButtonText}>End Session</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.slate[950],
	},
	closeButton: {
		width: 56,
		height: 56,
		borderRadius: 18,
		backgroundColor: colors.slate[800],
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	micGradient: {
		width: 180,
		height: 180,
		borderRadius: 90,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 32,
	},
	title: {
		color: white,
		fontSize: 56,
		lineHeight: 60,
		fontWeight: "700",
		marginBottom: 8,
	},
	subtitle: {
		color: white,
		fontSize: 22,
		fontWeight: "600",
		marginBottom: 6,
		textAlign: "center",
	},
	helper: {
		color: app.textMuted,
		fontSize: 16,
		marginBottom: 12,
		textAlign: "center",
	},
	category: {
		color: app.textMuted,
		fontSize: 13,
		marginBottom: 12,
	},
	transcriptLabel: {
		color: app.textMuted,
		fontSize: 13,
		alignSelf: "flex-start",
		marginBottom: 8,
		width: "100%",
	},
	transcriptBox: {
		width: "100%",
		minHeight: 96,
		borderRadius: 14,
		backgroundColor: "#111934",
		borderWidth: 1,
		borderColor: "#2a3561",
		paddingHorizontal: 14,
		paddingVertical: 12,
		marginBottom: 20,
	},
	transcriptText: {
		color: white,
		fontSize: 16,
		lineHeight: 22,
	},
	speakButton: {
		width: "100%",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.slate[700],
		borderRadius: 16,
		borderWidth: 1,
		borderColor: colors.slate[600],
		paddingVertical: 16,
		paddingHorizontal: 20,
		marginBottom: 20,
	},
	speakButtonPressed: {
		opacity: 0.9,
	},
	speakButtonDisabled: {
		opacity: 0.45,
	},
	speakIcon: {
		marginRight: 10,
	},
	speakButtonText: {
		color: white,
		fontSize: 17,
		fontWeight: "700",
	},
	waveWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	waveBar: {
		width: 8,
		borderRadius: 8,
		backgroundColor: app.buttonPrimary,
	},
	skipButton: {
		backgroundColor: app.buttonPrimary,
		borderRadius: 20,
		minHeight: 72,
		alignItems: "center",
		justifyContent: "center",
	},
	skipButtonPressed: {
		opacity: 0.9,
	},
	skipButtonText: {
		color: white,
		fontSize: 18,
		fontWeight: "700",
	},
});
