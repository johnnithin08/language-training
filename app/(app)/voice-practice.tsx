import { app, colors, white } from "@/constants/colors";
import { getCategoryDisplayLabel } from "@/constants/conversationCategoryConfig";
import { useAuth } from "@/contexts/auth";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function VoicePracticeScreen() {
	const router = useRouter();
	const { categoryId, voiceId } = useLocalSearchParams<{
		categoryId?: string;
		voiceId?: string;
	}>();
	const { userData } = useAuth();
	const insets = useSafeAreaInsets();

	const { step, transcripts, error, connect, disconnect } = useVoiceSession();
	const [isEndingSession, setIsEndingSession] = useState(false);
	const started = useRef(false);

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
		console.log(
			"Connecting voice session with system prompt:",
			systemPrompt,
		);
		void connect({ voiceId: voiceId ?? "tiffany", systemPrompt });
	}, [connect, categoryId, voiceId, userData?.currentLevel]);

	useEffect(() => {
		return () => {
			disconnect();
		};
	}, [disconnect]);

	const statusTitle = useMemo(() => {
		if (isEndingSession) return "Ending session";
		if (step === "connecting") return "Connecting...";
		if (step === "listening") return "Listening...";
		if (step === "speaking") return "Speaking...";
		if (step === "error") return "Something went wrong";
		return "Waiting...";
	}, [step, isEndingSession]);

	const statusSubtitle = useMemo(() => {
		if (isEndingSession) return "Wrapping up your voice practice";
		if (step === "connecting") return "Setting up Nova Sonic voice session";
		if (step === "listening") return "Say something in English";
		if (step === "speaking") return "AI is responding";
		if (step === "error") return error ?? "Connection error";
		return "Getting ready";
	}, [step, error, isEndingSession]);

	const helperText = useMemo(() => {
		if (isEndingSession) return "Almost done";
		if (step === "connecting") return "Hang tight";
		if (step === "speaking") return "Listen carefully";
		return "Speak naturally - No pressure";
	}, [step, isEndingSession]);

	const handleEndSession = useCallback(() => {
		if (isEndingSession) return;
		setIsEndingSession(true);
		disconnect();
		router.replace("/(app)");
	}, [isEndingSession, disconnect, router]);

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
				onPress={() => {
					disconnect();
					router.back();
				}}
				hitSlop={10}
			>
				<Ionicons name="close" size={24} color={white} />
			</Pressable>

			<View style={styles.content}>
				<LinearGradient
					colors={[...app.iconGradient]}
					style={styles.micGradient}
				>
					<Ionicons
						name={
							step === "speaking"
								? "volume-high-outline"
								: "mic-outline"
						}
						size={54}
						color={white}
					/>
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
					styles.endButton,
					pressed && styles.endButtonPressed,
					isEndingSession && styles.endButtonDisabled,
				]}
				onPress={handleEndSession}
				disabled={isEndingSession}
			>
				{isEndingSession ? (
					<ActivityIndicator color={white} />
				) : (
					<Text style={styles.endButtonText}>End Session</Text>
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
	endButtonDisabled: {
		opacity: 0.75,
	},
	endButtonText: {
		color: white,
		fontSize: 18,
		fontWeight: "700",
	},
});
