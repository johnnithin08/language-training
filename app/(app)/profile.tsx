import { app, colors, white } from "@/constants/colors";
import { useAuth } from "@/contexts/auth";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchUserAttributes } from "aws-amplify/auth";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

const LANGUAGE_DISPLAY: Record<string, { emoji: string; label: string }> = {
	english: { emoji: "🇺🇸", label: "English" },
	spanish: { emoji: "🇪🇸", label: "Spanish" },
	french: { emoji: "🇫🇷", label: "French" },
	german: { emoji: "🇩🇪", label: "German" },
};

const LEVEL_DISPLAY: Record<string, string> = {
	beginner: "Beginner",
	elementary: "Elementary",
	intermediate: "Intermediate",
	advanced: "Advanced",
};

const serifTitle = Platform.select({
	ios: "Georgia",
	android: "serif",
	default: undefined,
});

export default function ProfileScreen() {
	const { signOut, userData } = useAuth();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const [fullName, setFullName] = useState("");

	useFocusEffect(
		useCallback(() => {
			let active = true;
			const load = async () => {
				try {
					const attributes = await fetchUserAttributes();
					const name = attributes.name?.trim();
					if (active && name) setFullName(name);
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
	const levelLabel = LEVEL_DISPLAY[levelKey] ?? "—";

	const handleSignOut = async () => {
		await signOut();
		router.replace("/(auth)/landing");
	};

	return (
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
				<View style={styles.fieldBox}>
					<Text style={styles.fieldValue}>
						{fullName || "—"}
					</Text>
				</View>
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
				<View style={styles.fieldBox}>
					<Text style={styles.fieldValue}>{levelLabel}</Text>
				</View>
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
	);
}

const styles = StyleSheet.create({
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
	fieldValue: {
		fontSize: 17,
		fontWeight: "600",
		color: white,
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
});
