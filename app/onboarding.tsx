import { app, colors, white } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
	LANGUAGE_OPTIONS,
	LEVEL_OPTIONS,
} from "@/constants/learningOptions";

export default function OnboardingScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const { isAuthenticated, userData, setUserData } = useAuth();
	const [currentStep, setCurrentStep] = useState(1);
	const [selectedLanguage, setSelectedLanguage] = useState<string | null>(
		userData?.targetLanguage ?? null,
	);
	const [selectedLevel, setSelectedLevel] = useState<string | null>(
		userData?.currentLevel ?? null,
	);

	const canContinue = useMemo(() => {
		if (currentStep === 1) return Boolean(selectedLanguage);
		return Boolean(selectedLevel);
	}, [currentStep, selectedLanguage, selectedLevel]);

	const continueLabel = currentStep === 2 ? "Start Learning" : "Continue";

	if (!isAuthenticated) {
		return <Redirect href="/(auth)/landing" />;
	}

	const handleBack = () => {
		if (currentStep === 1) return;
		setCurrentStep((step) => Math.max(step - 1, 1));
	};

	const handleContinue = async () => {
		if (!canContinue) return;

		if (currentStep === 1) {
			await setUserData({
				targetLanguage: selectedLanguage ?? undefined,
			});
			setCurrentStep(2);
			return;
		}

		if (currentStep === 2) {
			await setUserData({
				currentLevel: selectedLevel ?? undefined,
				onboardingCompleted: true,
				targetLanguage: selectedLanguage ?? undefined,
			});
			router.replace("/(app)");
		}
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
			<View style={styles.topRow}>
				{currentStep > 1 ? (
					<Pressable
						style={styles.backButton}
						onPress={handleBack}
						hitSlop={10}
					>
						<Ionicons name="arrow-back" size={22} color={white} />
					</Pressable>
				) : (
					<View style={styles.backButtonSpacer} />
				)}
				<View style={styles.progressRow}>
					{[1, 2].map((step) => (
						<View
							key={step}
							style={[
								styles.progressDot,
								step <= currentStep && styles.progressDotActive,
							]}
						/>
					))}
				</View>
				<View style={styles.backButtonSpacer} />
			</View>

			<Text style={styles.stepText}>STEP {currentStep} OF 2</Text>

			{currentStep === 1 ? (
				<>
					<Text style={styles.title}>
						What language do you want to practice?
					</Text>
					<Text style={styles.subtitle}>
						Choose your target language
					</Text>
					<ScrollView
						contentContainerStyle={styles.grid}
						showsVerticalScrollIndicator={false}
					>
						{LANGUAGE_OPTIONS.map((option) => {
							const isSelected = selectedLanguage === option.id;
							return (
								<Pressable
									key={option.id}
									style={[
										styles.card,
										styles.gridCard,
										isSelected && styles.cardSelected,
									]}
									onPress={() =>
										setSelectedLanguage(option.id)
									}
								>
									<Text style={styles.cardEmoji}>
										{option.emoji}
									</Text>
									<View style={styles.cardTextWrap}>
										<Text style={styles.cardTitle}>
											{option.title}
										</Text>
										<Text style={styles.cardSubtitle}>
											{option.subtitle}
										</Text>
									</View>
								</Pressable>
							);
						})}
					</ScrollView>
				</>
			) : (
				<>
					<Text style={styles.title}>
						What&apos;s your current level?
					</Text>
					<Text style={styles.subtitle}>
						We&apos;ll tailor conversations to you
					</Text>
					<ScrollView
						contentContainerStyle={styles.list}
						showsVerticalScrollIndicator={false}
					>
						{LEVEL_OPTIONS.map((option) => {
							const isSelected = selectedLevel === option.id;
							return (
								<Pressable
									key={option.id}
									style={[
										styles.card,
										isSelected && styles.cardSelected,
									]}
									onPress={() => setSelectedLevel(option.id)}
								>
									<Text style={styles.cardEmoji}>
										{option.emoji}
									</Text>
									<View style={styles.cardTextWrap}>
										<Text style={styles.cardTitle}>
											{option.title}
										</Text>
										<Text style={styles.cardSubtitle}>
											{option.subtitle}
										</Text>
									</View>
								</Pressable>
							);
						})}
					</ScrollView>
				</>
			)}

			<Pressable
				style={({ pressed }) => [
					styles.ctaButton,
					pressed && styles.ctaButtonPressed,
					!canContinue && styles.ctaButtonDisabled,
				]}
				onPress={handleContinue}
				disabled={!canContinue}
			>
				<Text style={styles.ctaButtonText}>{continueLabel}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.slate[950],
	},
	topRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 22,
	},
	backButton: {
		width: 36,
		height: 36,
		borderRadius: 12,
		backgroundColor: colors.slate[800],
		alignItems: "center",
		justifyContent: "center",
	},
	backButtonSpacer: {
		width: 36,
		height: 36,
	},
	progressRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	progressDot: {
		width: 32,
		height: 8,
		borderRadius: 999,
		backgroundColor: colors.slate[700],
	},
	progressDotActive: {
		backgroundColor: app.buttonPrimary,
	},
	stepText: {
		color: "#f6a88f",
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 1.3,
		marginBottom: 14,
	},
	title: {
		color: white,
		fontSize: 34,
		lineHeight: 40,
		fontWeight: "700",
		marginBottom: 8,
	},
	subtitle: {
		color: app.textMuted,
		fontSize: 16,
		marginBottom: 18,
	},
	grid: {
		paddingBottom: 20,
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		rowGap: 12,
	},
	list: {
		paddingBottom: 20,
		gap: 12,
	},
	card: {
		backgroundColor: "#111934",
		borderColor: "#2a3561",
		borderWidth: 1,
		borderRadius: 20,
		paddingVertical: 18,
		paddingHorizontal: 16,
		flexDirection: "row",
		alignItems: "center",
		gap: 14,
	},
	gridCard: {
		width: "48%",
	},
	cardSelected: {
		backgroundColor: "#7056e7",
		borderColor: "#9276ff",
	},
	cardEmoji: {
		fontSize: 24,
		width: 34,
	},
	cardTextWrap: {
		flex: 1,
	},
	cardTitle: {
		color: white,
		fontSize: 18,
		fontWeight: "700",
		marginBottom: 2,
	},
	cardSubtitle: {
		color: "rgba(255,255,255,0.65)",
		fontSize: 14,
	},
	ctaButton: {
		backgroundColor: app.buttonPrimary,
		borderRadius: 20,
		paddingVertical: 18,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 16,
	},
	ctaButtonPressed: {
		opacity: 0.9,
	},
	ctaButtonDisabled: {
		opacity: 0.45,
	},
	ctaButtonText: {
		color: white,
		fontSize: 17,
		fontWeight: "700",
	},
});
