import { ScoreTrendChart } from "@/components/ScoreTrendChart";
import { app, colors, white } from "@/constants/colors";
import { listRecentSessions, type SessionListItem } from "@/services/session";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function DashboardScreen() {
	const insets = useSafeAreaInsets();
	const [sessionItems, setSessionItems] = useState<SessionListItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useFocusEffect(
		useCallback(() => {
			let active = true;
			const load = async () => {
				setLoading(true);
				setError(null);
				try {
					const items = await listRecentSessions(50);
					if (!active) return;
					setSessionItems(items);
				} catch (e) {
					if (active) {
						setError(
							e instanceof Error
								? e.message
								: "Could not load sessions.",
						);
						setSessionItems([]);
					}
				} finally {
					if (active) setLoading(false);
				}
			};
			void load();
			return () => {
				active = false;
			};
		}, []),
	);

	const sessionCount = useMemo(
		() => sessionItems.length,
		[sessionItems],
	);

	return (
		<ScrollView
			style={styles.scroll}
			contentContainerStyle={[
				styles.scrollContent,
				{
					paddingTop: insets.top + 24,
					paddingBottom: insets.bottom + 24,
					paddingLeft: insets.left + 24,
					paddingRight: insets.right + 24,
				},
			]}
			showsVerticalScrollIndicator={false}
		>
			<Text style={styles.title}>Dashboard</Text>
			<Text style={styles.subtitle}>Track your practice and progress</Text>

			<View style={styles.summaryRow}>
				<View style={styles.summaryCard}>
					<Text style={styles.summaryLabel}>Sessions</Text>
					<Text style={styles.summaryValue}>{sessionCount}</Text>
				</View>
			</View>

			{loading ? (
				<View style={styles.loadingWrap}>
					<ActivityIndicator color={app.buttonPrimary} />
				</View>
			) : error ? (
				<Text style={styles.errorText}>{error}</Text>
			) : (
				<ScoreTrendChart sessions={sessionItems} />
			)}
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
	title: {
		fontSize: 40,
		fontWeight: "700",
		color: white,
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 16,
		color: app.textMuted,
		marginBottom: 24,
	},
	/** Same row + ~half width as when Sessions and Avg. sat side by side (no full-bleed stretch). */
	summaryRow: {
		flexDirection: "row",
		gap: 12,
		marginBottom: 28,
	},
	summaryCard: {
		width: "48%",
		flexGrow: 0,
		flexShrink: 0,
		backgroundColor: "#111934",
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "#2a3561",
		padding: 18,
	},
	summaryLabel: {
		fontSize: 12,
		fontWeight: "700",
		color: app.textMuted,
		letterSpacing: 0.6,
		marginBottom: 8,
	},
	summaryValue: {
		fontSize: 32,
		fontWeight: "700",
		color: white,
	},
	loadingWrap: {
		paddingVertical: 48,
		alignItems: "center",
	},
	errorText: {
		color: "#fca5a5",
		fontSize: 15,
		lineHeight: 22,
	},
});
