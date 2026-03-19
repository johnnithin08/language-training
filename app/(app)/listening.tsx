import { app, colors, white } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoice, VoiceMode } from "react-native-voicekit";

export default function ListeningScreen() {
	const router = useRouter();
	const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
	const insets = useSafeAreaInsets();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [hasCapturedResult, setHasCapturedResult] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);
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

	console.log("ava", available);

	useEffect(() => {
		let active = true;
		const beginListening = async () => {
			try {
				if (!available) return;
				setErrorMessage(null);
				setHasCapturedResult(false);
				resetTranscript();
				await startListening();
			} catch {
				if (active) {
					setErrorMessage(
						"Could not start listening. Please try again.",
					);
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
		const restart = async () => {
			if (!listening && transcript.trim().length > 0) {
				setHasCapturedResult(true);
			}
		};
		restart();
	}, [listening, transcript]);

	const statusTitle = useMemo(() => {
		if (!available) return "Voice not available";
		if (errorMessage) return "Listening failed";
		if (hasCapturedResult) return "Captured";
		return listening ? "Listening..." : "Waiting...";
	}, [available, errorMessage, hasCapturedResult, listening]);

	const statusSubtitle = useMemo(() => {
		if (!available)
			return "Speech recognition is not available on this device";
		if (errorMessage) return errorMessage;
		if (hasCapturedResult) return "Here is what you said";
		return "Tell the AI something";
	}, [available, errorMessage, hasCapturedResult]);

	const helperText = useMemo(() => {
		if (hasCapturedResult)
			return "Auto-stopped after you finished speaking";
		return "Speak naturally - No pressure";
	}, [hasCapturedResult]);

	const transcriptText = transcript.trim();
	const canSpeak = transcriptText.length > 0;

	const handleSpeakTranscript = async () => {
		if (!canSpeak || isSpeaking) return;
		await Speech.stop();
		setIsSpeaking(true);
		Speech.speak(transcriptText, {
			language: "en-US",
			rate: 0.95,
			pitch: 1.0,
			onDone: () => {
				resetTranscript();
				setHasCapturedResult(false);
				setIsSpeaking(false);
				startListening();
			},
			onStopped: () => setIsSpeaking(false),
			onError: () => setIsSpeaking(false),
		});
	};

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
				<Text style={styles.transcriptLabel}>Transcript</Text>
				<View style={styles.transcriptBox}>
					<Text style={styles.transcriptText}>
						{transcriptText.length > 0
							? transcript
							: "Start speaking..."}
					</Text>
				</View>

				<Pressable
					style={({ pressed }) => [
						styles.speakButton,
						pressed && styles.speakButtonPressed,
						(!canSpeak || isSpeaking) && styles.speakButtonDisabled,
					]}
					onPress={() => void handleSpeakTranscript()}
					disabled={!canSpeak || isSpeaking}
				>
					<Ionicons
						name="volume-high"
						size={22}
						color={white}
						style={styles.speakIcon}
					/>
					<Text style={styles.speakButtonText}>
						{isSpeaking ? "Speaking…" : "Speak transcript"}
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
