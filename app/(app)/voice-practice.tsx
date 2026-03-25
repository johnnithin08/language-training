import { app, colors, white } from "@/constants/colors";
import { getCategoryDisplayLabel } from "@/constants/conversationCategoryConfig";
import { useAuth } from "@/contexts/auth";
import {
	useVoiceSession,
	type VoiceSessionAnalysis,
} from "@/hooks/useVoiceSession";
import { saveSession, type SessionAnalysis } from "@/services/session";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function toSessionAnalysis(va: VoiceSessionAnalysis): SessionAnalysis {
	return {
		scores: {
			grammar: va.scores.grammar ?? 0,
			fluency: va.scores.fluency ?? 0,
			pronunciation: va.scores.pronunciation ?? 0,
			vocabulary: va.scores.vocabulary ?? 0,
			coherence: va.scores.coherence ?? 0,
			overall: va.scores.overall ?? 0,
		},
		cefr_level: va.cefr_level ?? "",
		strengths: va.strengths ?? [],
		weaknesses: va.weaknesses ?? [],
		common_mistakes: va.common_mistakes ?? [],
		corrected_examples: (va.corrected_examples ?? []).map((e) => ({
			original: String(e.original ?? ""),
			corrected: String(e.corrected ?? ""),
		})),
		suggestions: va.suggestions ?? [],
	};
}

export default function VoicePracticeScreen() {
	const router = useRouter();
	const { categoryId, voiceId } = useLocalSearchParams<{
		categoryId?: string;
		voiceId?: string;
	}>();
	const { userData } = useAuth();
	const insets = useSafeAreaInsets();

	const { step, transcripts, error, analysis, connect, disconnect } =
		useVoiceSession();
	const started = useRef(false);
	const savedRef = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;

		const level = userData?.currentLevel ?? "intermediate";
		const category = categoryId ?? "free-talk";
		const systemPrompt =
			`You are a friendly English language practice partner. ` +
			`The learner's level is ${level}. ` +
			`Topic: ${category}. ` +
			`Keep replies concise and natural for spoken conversation. ` +
			`Gently correct mistakes. Start by greeting the learner and introducing the topic.`;
		void connect({ voiceId: voiceId ?? "tiffany", systemPrompt });
	}, [connect, categoryId, voiceId, userData?.currentLevel]);

	useEffect(() => {
		return () => {
			disconnect();
		};
	}, [disconnect]);

	useEffect(() => {
		if (!analysis || savedRef.current) return;
		savedRef.current = true;

		const persist = async () => {
			try {
				const sessionId = await saveSession({
					categoryId: categoryId ?? "free-talk",
					targetLanguage: userData?.targetLanguage ?? "English",
					analysis: toSessionAnalysis(analysis),
				});
				router.replace({
					pathname: "/(app)/session-analysis",
					params: { sessionId },
				});
			} catch (e) {
				const msg =
					e instanceof Error
						? e.message
						: "Could not save this session.";
				Alert.alert("Session", msg);
				router.replace("/(app)");
			}
		};
		persist();
	}, [analysis, categoryId, userData?.targetLanguage, router]);

	const statusTitle = useMemo(() => {
		if (step === "analyzing") return "Analyzing...";
		if (step === "connecting") return "Connecting...";
		if (step === "listening") return "Listening...";
		if (step === "speaking") return "Speaking...";
		if (step === "error") return "Something went wrong";
		return "Waiting...";
	}, [step]);

	const statusSubtitle = useMemo(() => {
		if (step === "analyzing") return "Reviewing your performance";
		if (step === "connecting") return "Setting up voice session";
		if (step === "listening") return "Say hello to start the conversation";
		if (step === "speaking") return "AI is responding";
		if (step === "error") return error ?? "Connection error";
		return "Getting ready";
	}, [step, error]);

	const helperText = useMemo(() => {
		if (step === "analyzing") return "This may take a moment";
		if (step === "connecting") return "Hang tight";
		if (step === "speaking") return "Listen carefully";
		return "Speak naturally - No pressure";
	}, [step]);

	const isSessionActive =
		step === "listening" || step === "speaking";

	const handleEndSession = useCallback(() => {
		disconnect();
	}, [disconnect]);

	const iconName = useMemo(() => {
		if (step === "speaking") return "volume-high-outline" as const;
		if (step === "analyzing") return "analytics-outline" as const;
		return "mic-outline" as const;
	}, [step]);

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
			{step !== "analyzing" && (
				<Pressable
					style={styles.closeButton}
					onPress={() => {
						disconnect();
						router.back();
					}}
					hitSlop={10}
				>
					<Ionicons name="close" size={24} color={white} />
				</Pressable>
			)}

			<View style={styles.content}>
				<LinearGradient
					colors={[...app.iconGradient]}
					style={styles.micGradient}
				>
					{step === "analyzing" ? (
						<ActivityIndicator size="large" color={white} />
					) : (
						<Ionicons
							name={iconName}
							size={54}
							color={white}
						/>
					)}
				</LinearGradient>

				<Text style={styles.title}>{statusTitle}</Text>
				<Text style={styles.subtitle}>{statusSubtitle}</Text>
				<Text style={styles.helper}>{helperText}</Text>
				<Text style={styles.category}>
					{getCategoryDisplayLabel(categoryId)}
				</Text>

				{step !== "analyzing" && (
					<View style={styles.waveWrap}>
						<View style={[styles.waveBar, { height: 18 }]} />
						<View style={[styles.waveBar, { height: 26 }]} />
						<View style={[styles.waveBar, { height: 14 }]} />
						<View style={[styles.waveBar, { height: 34 }]} />
						<View style={[styles.waveBar, { height: 22 }]} />
					</View>
				)}
			</View>

			{isSessionActive && (
				<Pressable
					style={({ pressed }) => [
						styles.endButton,
						pressed && styles.endButtonPressed,
					]}
					onPress={handleEndSession}
				>
					<Text style={styles.endButtonText}>End Session</Text>
				</Pressable>
			)}

			{step === "analyzing" && (
				<View style={styles.endButton}>
					<ActivityIndicator color={white} />
				</View>
			)}
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
	endButton: {
		backgroundColor: app.buttonPrimary,
		borderRadius: 20,
		minHeight: 72,
		alignItems: "center",
		justifyContent: "center",
	},
	endButtonPressed: {
		opacity: 0.9,
	},
	endButtonText: {
		color: white,
		fontSize: 18,
		fontWeight: "700",
	},
});
