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
	Modal,
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

	const { step, transcripts, error, sessionId, connect, disconnect } =
		useVoiceSession();
	const started = useRef(false);
	const [showEndModal, setShowEndModal] = useState(false);

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
		void connect({
			voiceId: voiceId ?? "tiffany",
			systemPrompt,
			categoryId: category,
			targetLanguage: userData?.targetLanguage ?? "English",
			languageLevel: level,
		});
	}, [connect, categoryId, voiceId, userData?.currentLevel, userData?.targetLanguage]);

	useEffect(() => {
		return () => {
			disconnect();
		};
	}, [disconnect]);

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
		setShowEndModal(true);
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
					<Ionicons name={iconName} size={54} color={white} />
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

			<Modal
				visible={showEndModal}
				transparent
				animationType="fade"
				statusBarTranslucent
			>
				<View style={styles.modalOverlay}>
					<View style={styles.modalCard}>
						<View style={styles.modalIconWrap}>
							<Ionicons
								name="analytics-outline"
								size={36}
								color={app.buttonPrimary}
							/>
						</View>
						<Text style={styles.modalTitle}>Session Ended</Text>
						<Text style={styles.modalBody}>
							Your session is being analysed. The results will
							appear in your recent sessions shortly.
						</Text>
						<ActivityIndicator
							size="small"
							color={app.buttonPrimary}
							style={{ marginBottom: 20 }}
						/>
						<Pressable
							style={({ pressed }) => [
								styles.modalButton,
								pressed && { opacity: 0.85 },
							]}
							onPress={() => {
								setShowEndModal(false);
								router.replace("/(app)");
							}}
						>
							<Text style={styles.modalButtonText}>
								Go to Home
							</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
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
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.7)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 28,
	},
	modalCard: {
		backgroundColor: colors.slate[900],
		borderRadius: 24,
		borderWidth: 1,
		borderColor: "#2a3561",
		paddingHorizontal: 28,
		paddingTop: 32,
		paddingBottom: 24,
		alignItems: "center",
		width: "100%",
		maxWidth: 360,
	},
	modalIconWrap: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: "rgba(99,102,241,0.15)",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 18,
	},
	modalTitle: {
		color: white,
		fontSize: 22,
		fontWeight: "700",
		marginBottom: 10,
		textAlign: "center",
	},
	modalBody: {
		color: app.textMuted,
		fontSize: 15,
		lineHeight: 22,
		textAlign: "center",
		marginBottom: 20,
	},
	modalButton: {
		backgroundColor: app.buttonPrimary,
		borderRadius: 16,
		paddingVertical: 14,
		paddingHorizontal: 32,
		width: "100%",
		alignItems: "center",
	},
	modalButtonText: {
		color: white,
		fontSize: 17,
		fontWeight: "700",
	},
});
