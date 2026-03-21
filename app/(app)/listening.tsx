import { app, colors, white } from "@/constants/colors";
import {
	getCategoryDisplayLabel,
	getOpeningPrompt,
} from "@/constants/conversationCategoryConfig";
import { useAuth } from "@/contexts/auth";
import {
	type AssistantMessage,
	getAssistantReply,
} from "@/services/assistant-reply";
import { analyzeSession, saveSession } from "@/services/session";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoice, VoiceMode } from "react-native-voicekit";

/**
 * Voice + AI + TTS pipeline (no on-screen transcript or reply text).
 */
type ListeningStep =
	| "awaiting_voice"
	| "opening"
	| "listening"
	| "thinking"
	| "playing";

export default function ListeningScreen() {
	const router = useRouter();
	const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
	const { userData } = useAuth();
	const insets = useSafeAreaInsets();
	const [error, setError] = useState<string | null>(null);
	const [step, setStep] = useState<ListeningStep>("awaiting_voice");
	const [isEndingSession, setIsEndingSession] = useState(false);

	const lastSubmittedRef = useRef<string | null>(null);
	const [messages, setMessages] = useState<AssistantMessage[]>([]);
	const messagesRef = useRef<AssistantMessage[]>([]);

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
		silenceTimeoutMs: 1000,
		enablePartialResults: false,
	});

	const speakThenResume = useCallback(
		(reply: string) => {
			Speech.speak(reply, {
				language: "en-US",
				rate: 0.95,
				pitch: 1.0,
				onDone: () => {
					resetTranscript();
					setStep("listening");
					startListening();
				},
				// onStopped: () => {
				// 	setStep("listening");
				// 	startListening();
				// },
				// onError: () => {
				// 	setStep("listening");
				// 	startListening();
				// },
			});
		},
		[resetTranscript, startListening],
	);

	/** Mic availability → awaiting_voice ↔ opening. Cleanup on unmount / when deps change. */
	useEffect(() => {
		if (available) setStep((s) => (s === "awaiting_voice" ? "opening" : s));

		return () => {
			void stopListening();
			void Speech.stop();
		};
	}, [available, stopListening]);

	/**
	 * Opening + first reply: deps intentionally omit `transcript` so recognition noise
	 * does not restart this flow while `step === "opening"`.
	 */
	useEffect(() => {
		if (!available || step !== "opening") return;

		const run = async () => {
			try {
				await stopListening();
				resetTranscript();
				setError(null);
				const opening = getOpeningPrompt(categoryId);
				const messagesForApi: AssistantMessage[] = [
					{ role: "user", content: opening },
				];
				const reply = await getAssistantReply(messagesForApi, {
					targetLanguage: userData?.targetLanguage,
					categoryId: categoryId ?? undefined,
				});
				const next: AssistantMessage[] = [
					...messagesForApi,
					{ role: "assistant", content: reply },
				];
				setMessages(next);
				messagesRef.current = next;
				setStep("playing");
				await Speech.stop();
				speakThenResume(reply);
			} catch (e) {
				console.error("Error in opening assistant flow", e);
				const msg =
					e instanceof Error ? e.message : "Could not reach the AI.";
				setError(msg);
				setStep("listening");
				void startListening();
			}
		};

		void run();
	}, [
		step,
		available,
		categoryId,
		userData?.targetLanguage,
		speakThenResume,
		startListening,
		stopListening,
		resetTranscript,
	]);

	/** Later turns: depends on `transcript`. */
	useEffect(() => {
		if (step !== "listening") return;
		if (listening) {
			lastSubmittedRef.current = null;
			return;
		}
		const text = transcript.trim();
		if (!text) return;
		if (lastSubmittedRef.current === text) return;
		lastSubmittedRef.current = text;

		const run = async () => {
			setStep("thinking");
			setError(null);
			try {
				const history = messagesRef.current;
				const messagesForApi: AssistantMessage[] = [
					...history,
					{ role: "user", content: text },
				];
				const reply = await getAssistantReply(messagesForApi, {
					targetLanguage: userData?.targetLanguage,
					categoryId: categoryId ?? undefined,
				});
				const next: AssistantMessage[] = [
					...messagesForApi,
					{ role: "assistant", content: reply },
				];
				setMessages(next);
				messagesRef.current = next;
				setStep("playing");
				await Speech.stop();
				speakThenResume(reply);
			} catch (e) {
				console.error("Error in assistant reply flow", e);
				const msg =
					e instanceof Error ? e.message : "Could not reach the AI.";
				setError(msg);
				setStep("listening");
				lastSubmittedRef.current = null;
				void startListening();
			}
		};

		void run();
	}, [
		step,
		listening,
		transcript,
		userData?.targetLanguage,
		categoryId,
		speakThenResume,
		startListening,
		resetTranscript,
	]);

	const statusTitle = useMemo(() => {
		if (isEndingSession) return "Saving session";
		if (!available) return "Voice not available";
		if (error && step === "listening") return "Something went wrong";
		if (step === "opening" || step === "thinking") return "Thinking...";
		if (step === "playing") return "One moment";
		return listening ? "Listening..." : "Waiting...";
	}, [available, error, step, listening, isEndingSession]);

	const statusSubtitle = useMemo(() => {
		if (isEndingSession)
			return "Analyzing your English and saving this session";
		if (!available)
			return "Speech recognition is not available on this device";
		if (error && step === "listening") return error;
		if (step === "opening") return "Starting your practice session";
		if (step === "thinking") return "Asking Claude on Amazon Bedrock";
		if (step === "playing") return "Reply is playing";
		return "Tell the AI something";
	}, [available, error, step, isEndingSession]);

	const helperText = useMemo(() => {
		if (isEndingSession) return "Almost done";
		if (step === "opening" || step === "thinking") return "Hang tight";
		if (step === "playing") return "Hang tight";
		return "Speak naturally - No pressure";
	}, [step, isEndingSession]);

	const handleEndSession = useCallback(async () => {
		if (isEndingSession) return;
		setIsEndingSession(true);
		setError(null);
		try {
			await stopListening();
			await Speech.stop();
			const snapshot = messagesRef.current;
			if (snapshot.length > 0) {
				const analysis = await analyzeSession(snapshot);
				const sessionId = await saveSession({
					categoryId: categoryId ?? "free-talk",
					targetLanguage: userData?.targetLanguage ?? "English",
					analysis,
				});
				router.replace({
					pathname: "/(app)/session-analysis",
					params: { sessionId },
				});
				return;
			}
		} catch (e) {
			console.error("End session failed", e);
			const msg =
				e instanceof Error ? e.message : "Could not save this session.";
			Alert.alert("Session", msg);
		}
		router.replace("/(app)");
	}, [
		isEndingSession,
		stopListening,
		categoryId,
		userData?.targetLanguage,
		router,
	]);

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
				<Text style={styles.category}>
					{getCategoryDisplayLabel(categoryId)}
				</Text>

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
					isEndingSession && styles.skipButtonDisabled,
				]}
				onPress={() => void handleEndSession()}
				disabled={isEndingSession}
			>
				{isEndingSession ? (
					<ActivityIndicator color={white} />
				) : (
					<Text style={styles.skipButtonText}>End Session</Text>
				)}
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
		marginBottom: 24,
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
	skipButtonDisabled: {
		opacity: 0.75,
	},
	skipButtonText: {
		color: white,
		fontSize: 18,
		fontWeight: "700",
	},
});
