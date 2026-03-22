import { app, colors, white } from "@/constants/colors";
import {
	getCategoryEmoji,
	getCategoryTitle,
} from "@/constants/conversationCategoryConfig";
import {
	formatSessionMeta,
	listRecentSessions,
	scoreToDisplayColor,
	type SessionListItem,
} from "@/services/session";
import {
	getStoredMicPermission,
	syncMicPermissionState,
} from "@/utils/mic-permission";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { fetchUserAttributes } from "aws-amplify/auth";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	ListRenderItem,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type SessionRow = {
	id: string;
	title: string;
	meta: string;
	score: string;
	scoreColor: string;
	emoji: string;
};

export default function HomeScreen() {
	const insets = useSafeAreaInsets();
	const router = useRouter();
	const [name, setName] = useState("");
	const [sessions, setSessions] = useState<SessionRow[]>([]);
	const [sessionsLoading, setSessionsLoading] = useState(true);
	const [sessionsError, setSessionsError] = useState<string | null>(null);
	const [micAllowed, setMicAllowed] = useState<boolean | null>(
		Platform.OS === "android" ? null : true,
	);

	const mapItemToRow = useCallback((item: SessionListItem): SessionRow => {
		const overall = item.analysis?.scores.overall ?? 0;
		return {
			id: item.id,
			title: getCategoryTitle(item.categoryId),
			meta: formatSessionMeta(item.createdAt),
			score: overall.toFixed(1),
			scoreColor: scoreToDisplayColor(overall),
			emoji: getCategoryEmoji(item.categoryId),
		};
	}, []);

	useFocusEffect(
		useCallback(() => {
			let active = true;
			const load = async () => {
				setSessionsLoading(true);
				setSessionsError(null);
				try {
					const items = await listRecentSessions(50);
					if (!active) return;
					setSessions(items.slice(0, 5).map(mapItemToRow));
				} catch (e) {
					console.error("listRecentSessions", e);
					if (active) {
						setSessionsError(
							e instanceof Error
								? e.message
								: "Could not load sessions.",
						);
						setSessions([]);
					}
				} finally {
					if (active) setSessionsLoading(false);
				}
			};
			void load();
			return () => {
				active = false;
			};
		}, [mapItemToRow]),
	);

	useFocusEffect(
		useCallback(() => {
			let active = true;
			const loadName = async () => {
				try {
					const attributes = await fetchUserAttributes();
					const profileName = attributes.name?.trim();
					if (active && profileName) {
						setName(profileName);
					}
				} catch {
					// keep fallback greeting
				}
			};
			void loadName();
			return () => {
				active = false;
			};
		}, []),
	);

	useFocusEffect(
		useCallback(() => {
			if (Platform.OS !== "android") return;
			let cancelled = false;
			const run = async () => {
				const stored = await getStoredMicPermission();
				if (!cancelled && stored === "denied") {
					setMicAllowed(false);
				}
				const ok = await syncMicPermissionState();
				if (!cancelled) setMicAllowed(ok);
			};
			void run();
			return () => {
				cancelled = true;
			};
		}, []),
	);

	const greeting = useMemo(() => `Welcome back ${name}`, [name]);

	const contentPadding = useMemo(
		() => ({
			paddingTop: insets.top + 24,
			paddingBottom: insets.bottom + 24,
			paddingLeft: insets.left + 24,
			paddingRight: insets.right + 24,
		}),
		[insets.bottom, insets.left, insets.right, insets.top],
	);

	const renderSession: ListRenderItem<SessionRow> = useCallback(
		({ item }) => (
			<Pressable
				style={({ pressed }) => [
					styles.card,
					pressed && styles.cardPressed,
				]}
				onPress={() =>
					router.push({
						pathname: "/(app)/session-analysis",
						params: { sessionId: item.id },
					})
				}
			>
				<View style={styles.iconWrap}>
					<Text style={styles.iconText}>{item.emoji}</Text>
				</View>
				<View style={styles.cardBody}>
					<Text style={styles.cardTitle}>{item.title}</Text>
					<Text style={styles.cardMeta}>{item.meta}</Text>
				</View>
				<View style={styles.scoreWrap}>
					<Text
						style={[styles.scoreValue, { color: item.scoreColor }]}
					>
						{item.score}
					</Text>
					<Text style={styles.scoreLabel}>Score</Text>
				</View>
			</Pressable>
		),
		[router],
	);

	const listEmpty = useMemo(() => {
		if (sessionsLoading) {
			return (
				<View style={styles.sessionsLoading}>
					<ActivityIndicator color={app.buttonPrimary} />
					<Text style={styles.sessionsLoadingText}>
						Loading sessions…
					</Text>
				</View>
			);
		}
		if (sessionsError) {
			return (
				<Text style={styles.sessionsError}>{sessionsError}</Text>
			);
		}
		return (
			<Text style={styles.sessionsEmpty}>
				No sessions yet. Finish a conversation to see your score here.
			</Text>
		);
	}, [sessionsLoading, sessionsError]);

	return (
		<View style={[styles.container, contentPadding]}>
			<Text style={styles.welcome}>{greeting}</Text>
			<Text style={styles.title}>Ready to practice?</Text>

			<Text style={styles.sectionLabel}>NEW CONVERSATION</Text>
			<Pressable
				style={({ pressed }) => [
					styles.newConversationCard,
					micAllowed !== true && styles.newConversationCardDisabled,
					pressed && micAllowed === true && styles.cardPressed,
				]}
				disabled={micAllowed !== true}
				onPress={() => router.push("/(app)/conversations")}
			>
				<LinearGradient
					colors={[...app.iconGradient]}
					style={styles.newConversationIconWrap}
				>
					<View style={styles.newConversationIconInner}>
						<Ionicons
							name="mic"
							size={24}
							color={app.iconOnLight}
						/>
					</View>
				</LinearGradient>
				<View style={styles.cardBody}>
					<Text style={styles.cardTitle}>New Conversation</Text>
					<Text style={styles.cardMeta}>
						{micAllowed === false
							? "Allow microphone access in Settings to start"
							: "English practice • Choose a topic"}
					</Text>
				</View>
				<Text style={styles.chevron}>›</Text>
			</Pressable>

			<Text style={styles.sectionLabel}>RECENT SESSIONS</Text>
			<FlatList
				style={styles.sessionsList}
				data={sessions}
				keyExtractor={(item) => item.id}
				renderItem={renderSession}
				ListEmptyComponent={listEmpty}
				ItemSeparatorComponent={SessionSeparator}
				contentContainerStyle={styles.sessionsListContent}
				showsVerticalScrollIndicator={false}
			/>
		</View>
	);
}

function SessionSeparator() {
	return <View style={styles.sessionSeparator} />;
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.slate[900],
	},
	sessionsList: {
		flex: 1,
	},
	sessionsListContent: {
		flexGrow: 1,
	},
	sessionSeparator: {
		height: 14,
	},
	welcome: {
		fontSize: 18,
		color: app.textMuted,
		marginBottom: 4,
	},
	title: {
		fontSize: 40,
		fontWeight: "700",
		color: white,
		marginBottom: 28,
	},
	sectionLabel: {
		fontSize: 14,
		fontWeight: "700",
		color: app.textMuted,
		letterSpacing: 0.8,
		marginBottom: 16,
	},
	sessionsLoading: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 8,
	},
	sessionsLoadingText: {
		color: app.textMuted,
		fontSize: 15,
	},
	sessionsError: {
		color: "#fca5a5",
		fontSize: 15,
		lineHeight: 22,
	},
	sessionsEmpty: {
		color: app.textMuted,
		fontSize: 15,
		lineHeight: 22,
	},
	card: {
		backgroundColor: "#111934",
		borderRadius: 22,
		borderWidth: 1,
		borderColor: "#2a3561",
		paddingHorizontal: 14,
		paddingVertical: 16,
		flexDirection: "row",
		alignItems: "center",
	},
	newConversationCard: {
		backgroundColor: "#111934",
		borderRadius: 22,
		borderWidth: 1,
		borderColor: "#2a3561",
		paddingHorizontal: 14,
		paddingVertical: 16,
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 24,
	},
	newConversationCardDisabled: {
		opacity: 0.55,
	},
	newConversationIconWrap: {
		width: 56,
		height: 56,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 14,
	},
	newConversationIconInner: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: white,
		alignItems: "center",
		justifyContent: "center",
	},
	cardPressed: {
		opacity: 0.9,
	},
	chevron: {
		color: app.textMuted,
		fontSize: 28,
		lineHeight: 28,
		marginLeft: 8,
	},
	iconWrap: {
		width: 48,
		height: 48,
		borderRadius: 14,
		backgroundColor: "#17454f",
		alignItems: "center",
		justifyContent: "center",
		marginRight: 14,
	},
	iconText: {
		fontSize: 20,
	},
	cardBody: {
		flex: 1,
	},
	cardTitle: {
		color: white,
		fontSize: 18,
		fontWeight: "700",
		marginBottom: 2,
	},
	cardMeta: {
		color: app.textMuted,
		fontSize: 14,
	},
	scoreWrap: {
		alignItems: "flex-end",
	},
	scoreValue: {
		fontSize: 28,
		fontWeight: "700",
		marginBottom: 2,
	},
	scoreLabel: {
		color: app.textMuted,
		fontSize: 14,
	},
});
