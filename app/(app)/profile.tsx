import { app, colors, white } from "@/constants/colors";
import { LEVEL_OPTIONS } from "@/constants/learningOptions";
import {
	getOrCreateUserConfig,
	updateUserConfig,
	type UserConfig,
} from "@/services/user-config";
import { useAuth } from "@/contexts/auth";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { fetchUserAttributes, updateUserAttribute } from "aws-amplify/auth";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const VOICE_OPTIONS: { id: string; label: string }[] = [
	{ id: "tiffany", label: "Tiffany" },
	{ id: "matthew", label: "Matthew" },
	{ id: "amy", label: "Amy" },
	{ id: "lupe", label: "Lupe" },
	{ id: "carlos", label: "Carlos" },
	{ id: "ambre", label: "Ambre" },
	{ id: "florian", label: "Florian" },
	{ id: "greta", label: "Greta" },
	{ id: "lennart", label: "Lennart" },
	{ id: "beatrice", label: "Beatrice" },
	{ id: "lorenzo", label: "Lorenzo" },
];

const LANGUAGE_DISPLAY: Record<string, { emoji: string; label: string }> = {
	english: { emoji: "🇺🇸", label: "English" },
	spanish: { emoji: "🇪🇸", label: "Spanish" },
	french: { emoji: "🇫🇷", label: "French" },
	german: { emoji: "🇩🇪", label: "German" },
};

const serifTitle = Platform.select({
	ios: "Georgia",
	android: "serif",
	default: undefined,
});

export default function ProfileScreen() {
	const { signOut, userData, setUserData } = useAuth();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const [fullName, setFullName] = useState("");
	const [nameDraft, setNameDraft] = useState("");
	const [savingName, setSavingName] = useState(false);
	const [savingLevel, setSavingLevel] = useState(false);
	const [levelModalVisible, setLevelModalVisible] = useState(false);

	const [config, setConfig] = useState<UserConfig | null>(null);
	const [savingConfig, setSavingConfig] = useState(false);
	const [voiceModalVisible, setVoiceModalVisible] = useState(false);

	useFocusEffect(
		useCallback(() => {
			let active = true;
			const load = async () => {
				try {
					const [attributes, userConfig] = await Promise.all([
						fetchUserAttributes(),
						getOrCreateUserConfig(),
					]);
					const name = attributes.name?.trim() ?? "";
					if (active) {
						setFullName(name);
						setNameDraft(name);
						setConfig(userConfig);
					}
				} catch {
					// ignore
				}
			};
			void load();
			return () => {
				active = false;
			};
		}, []),
	);

	const nameDirty = useMemo(
		() => nameDraft.trim() !== fullName.trim(),
		[nameDraft, fullName],
	);

	const initial = useMemo(() => {
		const n = fullName.trim();
		if (!n) return "?";
		return n.charAt(0).toUpperCase();
	}, [fullName]);

	const lang = userData?.targetLanguage?.toLowerCase() ?? "english";
	const languageInfo = LANGUAGE_DISPLAY[lang] ?? {
		emoji: "🌐",
		label:
			userData?.targetLanguage?.replace(/^\w/, (c) => c.toUpperCase()) ??
			"—",
	};

	const levelKey = userData?.currentLevel?.toLowerCase() ?? "";
	const levelLabel =
		LEVEL_OPTIONS.find((o) => o.id === levelKey)?.title ?? "—";

	const handleSaveName = async () => {
		const trimmed = nameDraft.trim();
		if (!trimmed) {
			Alert.alert("Name", "Please enter your name.");
			return;
		}
		if (!nameDirty) return;
		setSavingName(true);
		try {
			await updateUserAttribute({
				userAttribute: {
					attributeKey: "name",
					value: trimmed,
				},
			});
			setFullName(trimmed);
			await setUserData({});
		} catch (e) {
			console.error("updateUserAttribute name", e);
			Alert.alert(
				"Name",
				e instanceof Error ? e.message : "Could not save your name.",
			);
		} finally {
			setSavingName(false);
		}
	};

	const handleSelectLevel = async (levelId: string) => {
		if (levelId === levelKey) {
			setLevelModalVisible(false);
			return;
		}
		setSavingLevel(true);
		try {
			await setUserData({ currentLevel: levelId });
			setLevelModalVisible(false);
		} catch (e) {
			console.error("setUserData currentLevel", e);
			Alert.alert(
				"Proficiency",
				e instanceof Error ? e.message : "Could not save your level.",
			);
		} finally {
			setSavingLevel(false);
		}
	};

	const handleToggleVoice = async (enabled: boolean) => {
		if (!config || savingConfig) return;
		setSavingConfig(true);
		try {
			const updated = await updateUserConfig(config.id, {
				voiceToVoiceEnabled: enabled,
			});
			setConfig(updated);
		} catch (e) {
			Alert.alert(
				"Voice Mode",
				e instanceof Error ? e.message : "Could not save setting.",
			);
		} finally {
			setSavingConfig(false);
		}
	};

	const handleSelectVoice = async (voiceId: string) => {
		if (!config || voiceId === config.voiceId) {
			setVoiceModalVisible(false);
			return;
		}
		setSavingConfig(true);
		try {
			const updated = await updateUserConfig(config.id, { voiceId });
			setConfig(updated);
			setVoiceModalVisible(false);
		} catch (e) {
			Alert.alert(
				"Voice",
				e instanceof Error ? e.message : "Could not save voice.",
			);
		} finally {
			setSavingConfig(false);
		}
	};

	const selectedVoiceLabel =
		VOICE_OPTIONS.find((v) => v.id === config?.voiceId)?.label ?? "—";

	const handleSignOut = async () => {
		await signOut();
		router.replace("/(auth)/landing");
	};

	return (
		<KeyboardAvoidingView
			style={styles.keyboard}
			behavior={Platform.OS === "ios" ? "padding" : undefined}
		>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={[
					styles.scrollContent,
					{
						paddingTop: insets.top + 20,
						paddingBottom: insets.bottom + 32,
						paddingLeft: insets.left + 24,
						paddingRight: insets.right + 24,
					},
				]}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				<View style={styles.avatarWrap}>
					<LinearGradient
						colors={[...app.iconGradient]}
						style={styles.avatar}
					>
						<Text style={styles.avatarLetter}>{initial}</Text>
					</LinearGradient>
				</View>

				<Text style={styles.pageTitle}>Your Profile</Text>

				<Text style={styles.cardSectionLabel}>PERSONAL INFO</Text>
				<View style={styles.card}>
					<Text style={styles.fieldLabel}>FULL NAME</Text>
					<TextInput
						style={styles.fieldInput}
						value={nameDraft}
						onChangeText={setNameDraft}
						placeholder="Your name"
						placeholderTextColor={app.textMuted}
						autoCapitalize="words"
						autoCorrect={false}
						editable={!savingName}
					/>
					<Pressable
						style={({ pressed }) => [
							styles.saveNameButton,
							(!nameDirty || savingName) && styles.saveNameButtonDisabled,
							pressed && nameDirty && !savingName && styles.saveNamePressed,
						]}
						onPress={() => void handleSaveName()}
						disabled={!nameDirty || savingName}
					>
						{savingName ? (
							<ActivityIndicator color={white} size="small" />
						) : (
							<Text style={styles.saveNameText}>Save name</Text>
						)}
					</Pressable>
				</View>

				<Text style={styles.cardSectionLabel}>LEARNING GOALS</Text>
				<View style={styles.card}>
					<Text style={styles.fieldLabel}>TARGET LANGUAGE</Text>
					<View style={styles.fieldBox}>
						<Text style={styles.fieldValue}>
							{languageInfo.emoji} {languageInfo.label}
						</Text>
					</View>
					<Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
						PROFICIENCY LEVEL
					</Text>
					<Pressable
						style={({ pressed }) => [
							styles.fieldBox,
							styles.levelRow,
							pressed && styles.levelRowPressed,
							savingLevel && styles.levelRowDisabled,
						]}
						onPress={() => !savingLevel && setLevelModalVisible(true)}
						disabled={savingLevel}
					>
						<Text style={styles.fieldValue}>{levelLabel}</Text>
						{savingLevel ? (
							<ActivityIndicator color={app.textMuted} size="small" />
						) : (
							<Ionicons
								name="chevron-forward"
								size={20}
								color={app.textMuted}
							/>
						)}
					</Pressable>
				</View>

				<Text style={styles.cardSectionLabel}>VOICE PRACTICE</Text>
				<View style={styles.card}>
					<View style={styles.voiceToggleRow}>
						<View style={styles.voiceToggleText}>
							<Text style={styles.voiceToggleLabel}>
								Voice-to-voice mode
							</Text>
							<Text style={styles.voiceToggleHint}>
								Speak naturally and hear replies aloud
							</Text>
						</View>
						<Switch
							value={config?.voiceToVoiceEnabled ?? false}
							onValueChange={(v) => void handleToggleVoice(v)}
							disabled={!config || savingConfig}
							trackColor={{
								false: colors.slate[700],
								true: "rgba(61, 212, 200, 0.4)",
							}}
							thumbColor={
								config?.voiceToVoiceEnabled ? "#3dd4c8" : colors.slate[400]
							}
						/>
					</View>

					{config?.voiceToVoiceEnabled ? (
						<>
							<Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
								ASSISTANT VOICE
							</Text>
							<Pressable
								style={({ pressed }) => [
									styles.fieldBox,
									styles.levelRow,
									pressed && styles.levelRowPressed,
									savingConfig && styles.levelRowDisabled,
								]}
								onPress={() =>
									!savingConfig && setVoiceModalVisible(true)
								}
								disabled={savingConfig}
							>
								<Text style={styles.fieldValue}>
									{selectedVoiceLabel}
								</Text>
								{savingConfig ? (
									<ActivityIndicator
										color={app.textMuted}
										size="small"
									/>
								) : (
									<Ionicons
										name="chevron-forward"
										size={20}
										color={app.textMuted}
									/>
								)}
							</Pressable>
						</>
					) : null}
				</View>

				<Pressable
					style={({ pressed }) => [
						styles.signOut,
						pressed && styles.signOutPressed,
					]}
					onPress={() => void handleSignOut()}
				>
					<Ionicons name="log-out-outline" size={22} color="#fca5a5" />
					<Text style={styles.signOutText}>Sign out</Text>
				</Pressable>
			</ScrollView>

			<Modal
				visible={levelModalVisible}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => setLevelModalVisible(false)}
			>
				<View
					style={[
						styles.modalContainer,
						{
							paddingTop: insets.top + 16,
							paddingBottom: insets.bottom + 24,
						},
					]}
				>
					<View style={styles.modalHeader}>
						<Text style={styles.modalTitle}>Proficiency level</Text>
						<Pressable
							style={styles.modalClose}
							onPress={() => setLevelModalVisible(false)}
							hitSlop={12}
						>
							<Ionicons name="close" size={26} color={white} />
						</Pressable>
					</View>
					<Text style={styles.modalSubtitle}>
						We tailor conversations to your level
					</Text>
					<ScrollView
						contentContainerStyle={styles.modalList}
						showsVerticalScrollIndicator={false}
					>
						{LEVEL_OPTIONS.map((option) => {
							const selected = option.id === levelKey;
							return (
								<Pressable
									key={option.id}
									style={[
										styles.levelOption,
										selected && styles.levelOptionSelected,
									]}
									onPress={() => void handleSelectLevel(option.id)}
								>
									<Text style={styles.levelOptionEmoji}>
										{option.emoji}
									</Text>
									<View style={styles.levelOptionText}>
										<Text style={styles.levelOptionTitle}>
											{option.title}
										</Text>
										<Text style={styles.levelOptionSubtitle}>
											{option.subtitle}
										</Text>
									</View>
									{selected ? (
										<Ionicons
											name="checkmark-circle"
											size={24}
											color={white}
										/>
									) : null}
								</Pressable>
							);
						})}
					</ScrollView>
				</View>
			</Modal>
			<Modal
				visible={voiceModalVisible}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => setVoiceModalVisible(false)}
			>
				<View
					style={[
						styles.modalContainer,
						{
							paddingTop: insets.top + 16,
							paddingBottom: insets.bottom + 24,
						},
					]}
				>
					<View style={styles.modalHeader}>
						<Text style={styles.modalTitle}>Assistant voice</Text>
						<Pressable
							style={styles.modalClose}
							onPress={() => setVoiceModalVisible(false)}
							hitSlop={12}
						>
							<Ionicons name="close" size={26} color={white} />
						</Pressable>
					</View>
					<Text style={styles.modalSubtitle}>
						Choose the voice for spoken replies
					</Text>
					<ScrollView
						contentContainerStyle={styles.modalList}
						showsVerticalScrollIndicator={false}
					>
						{VOICE_OPTIONS.map((option) => {
							const selected = option.id === config?.voiceId;
							return (
								<Pressable
									key={option.id}
									style={[
										styles.levelOption,
										selected && styles.levelOptionSelected,
									]}
									onPress={() => void handleSelectVoice(option.id)}
								>
									<Ionicons
										name="mic-outline"
										size={22}
										color={selected ? white : app.textMuted}
									/>
									<View style={styles.levelOptionText}>
										<Text style={styles.levelOptionTitle}>
											{option.label}
										</Text>
									</View>
									{selected ? (
										<Ionicons
											name="checkmark-circle"
											size={24}
											color={white}
										/>
									) : null}
								</Pressable>
							);
						})}
					</ScrollView>
				</View>
			</Modal>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	keyboard: {
		flex: 1,
		backgroundColor: colors.slate[900],
	},
	scroll: {
		flex: 1,
		backgroundColor: colors.slate[900],
	},
	scrollContent: {
		flexGrow: 1,
	},
	avatarWrap: {
		alignItems: "center",
		marginBottom: 16,
	},
	avatar: {
		width: 88,
		height: 88,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarLetter: {
		fontSize: 36,
		fontWeight: "700",
		color: white,
	},
	pageTitle: {
		fontSize: 32,
		fontWeight: "700",
		color: white,
		textAlign: "center",
		marginBottom: 28,
		fontFamily: serifTitle,
	},
	cardSectionLabel: {
		fontSize: 12,
		fontWeight: "700",
		color: app.textMuted,
		letterSpacing: 1.2,
		marginBottom: 12,
	},
	card: {
		backgroundColor: "#111934",
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "#2a3561",
		padding: 18,
		marginBottom: 24,
	},
	fieldLabel: {
		fontSize: 11,
		fontWeight: "700",
		color: app.textMuted,
		letterSpacing: 0.8,
		marginBottom: 8,
	},
	fieldLabelSpaced: {
		marginTop: 16,
	},
	fieldBox: {
		backgroundColor: colors.slate[950],
		borderRadius: 14,
		borderWidth: 1,
		borderColor: "#2a3561",
		paddingVertical: 14,
		paddingHorizontal: 16,
	},
	fieldInput: {
		backgroundColor: colors.slate[950],
		borderRadius: 14,
		borderWidth: 1,
		borderColor: "#2a3561",
		paddingVertical: 14,
		paddingHorizontal: 16,
		fontSize: 17,
		fontWeight: "600",
		color: white,
		marginBottom: 12,
	},
	saveNameButton: {
		backgroundColor: app.buttonPrimary,
		borderRadius: 14,
		paddingVertical: 14,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 48,
	},
	saveNameButtonDisabled: {
		opacity: 0.4,
	},
	saveNamePressed: {
		opacity: 0.9,
	},
	saveNameText: {
		color: white,
		fontSize: 16,
		fontWeight: "700",
	},
	fieldValue: {
		fontSize: 17,
		fontWeight: "600",
		color: white,
		flex: 1,
	},
	levelRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	levelRowPressed: {
		opacity: 0.92,
	},
	levelRowDisabled: {
		opacity: 0.7,
	},
	voiceToggleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	voiceToggleText: {
		flex: 1,
	},
	voiceToggleLabel: {
		fontSize: 16,
		fontWeight: "700",
		color: white,
		marginBottom: 3,
	},
	voiceToggleHint: {
		fontSize: 13,
		color: app.textMuted,
	},
	signOut: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		marginTop: 8,
		paddingVertical: 16,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#3f2d2d",
		backgroundColor: "rgba(127, 29, 29, 0.15)",
	},
	signOutPressed: {
		opacity: 0.9,
	},
	signOutText: {
		fontSize: 17,
		fontWeight: "600",
		color: "#fca5a5",
	},
	modalContainer: {
		flex: 1,
		backgroundColor: colors.slate[900],
		paddingHorizontal: 20,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	modalTitle: {
		fontSize: 22,
		fontWeight: "700",
		color: white,
	},
	modalClose: {
		padding: 4,
	},
	modalSubtitle: {
		color: app.textMuted,
		fontSize: 15,
		marginBottom: 20,
	},
	modalList: {
		gap: 12,
		paddingBottom: 24,
	},
	levelOption: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#111934",
		borderRadius: 18,
		borderWidth: 1,
		borderColor: "#2a3561",
		paddingVertical: 16,
		paddingHorizontal: 14,
		gap: 12,
	},
	levelOptionSelected: {
		borderColor: "#9276ff",
		backgroundColor: "rgba(112, 86, 231, 0.35)",
	},
	levelOptionEmoji: {
		fontSize: 24,
		width: 32,
	},
	levelOptionText: {
		flex: 1,
	},
	levelOptionTitle: {
		color: white,
		fontSize: 17,
		fontWeight: "700",
		marginBottom: 2,
	},
	levelOptionSubtitle: {
		color: "rgba(255,255,255,0.65)",
		fontSize: 14,
	},
});
