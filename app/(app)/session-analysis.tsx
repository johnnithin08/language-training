import { app, colors, white } from "@/constants/colors";
import {
	analysisFeedbackHeadline,
	analysisFeedbackSubtitle,
	cefrIndex,
	cefrLabel,
	getSessionById,
	type SessionDetail,
} from "@/services/session";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// import Svg, {
// 	Circle,
// 	Defs,
// 	LinearGradient as SvgLinearGradient,
// 	Stop,
// } from "react-native-svg";

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

const BAR_COLORS = {
	grammar: "#a855f7",
	fluency: "#2dd4bf",
	pronunciation: "#f472b6",
	vocabulary: "#fb923c",
	coherence: "#818cf8",
} as const;

const RING_SIZE = 200;
const RING_STROKE = 12;
const R = (RING_SIZE - RING_STROKE) / 2;
const CX = RING_SIZE / 2;
const CY = RING_SIZE / 2;
const CIRC = 2 * Math.PI * R;

// function ScoreRing({ progress }: { progress: number }) {
// 	const p = Math.min(1, Math.max(0, progress / 10));
// 	const offset = CIRC * (1 - p);

// 	return (
// 		<View style={styles.ringWrap}>
// 			<Svg width={RING_SIZE} height={RING_SIZE}>
// 				<Defs>
// 					<SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
// 						<Stop offset="0" stopColor="#5eead4" />
// 						<Stop offset="0.5" stopColor="#a78bfa" />
// 						<Stop offset="1" stopColor="#c084fc" />
// 					</SvgLinearGradient>
// 				</Defs>
// 				<Circle
// 					cx={CX}
// 					cy={CY}
// 					r={R}
// 					stroke="#1e293b"
// 					strokeWidth={RING_STROKE}
// 					fill="none"
// 				/>
// 				<Circle
// 					cx={CX}
// 					cy={CY}
// 					r={R}
// 					stroke="url(#ringGrad)"
// 					strokeWidth={RING_STROKE}
// 					fill="none"
// 					strokeDasharray={CIRC}
// 					strokeDashoffset={offset}
// 					strokeLinecap="round"
// 					transform={`rotate(-90 ${CX} ${CY})`}
// 				/>
// 			</Svg>
// 		</View>
// 	);
// }

function ScoreBar({
	label,
	score,
	color,
}: {
	label: string;
	score: number;
	color: string;
}) {
	const pct = Math.min(100, Math.max(0, (score / 10) * 100));
	return (
		<View style={styles.barBlock}>
			<View style={styles.barHeader}>
				<View style={[styles.barDot, { backgroundColor: color }]} />
				<Text style={styles.barLabel}>{label}</Text>
				<Text style={styles.barValue}>{Math.round(score)}/10</Text>
			</View>
			<View style={styles.barTrack}>
				<View
					style={[
						styles.barFill,
						{ width: `${pct}%`, backgroundColor: color },
					]}
				/>
			</View>
		</View>
	);
}

function CorrectionCard({
	original,
	corrected,
	hint,
}: {
	original: string;
	corrected: string;
	hint: string;
}) {
	return (
		<View style={styles.correctionCard}>
			<View style={styles.correctionIcon}>
				<Ionicons name="close" size={14} color={white} />
			</View>
			<View style={styles.correctionBody}>
				<Text style={styles.correctionWrong} numberOfLines={3}>
					{original}
				</Text>
				<Text style={styles.correctionRight} numberOfLines={3}>
					{corrected}
				</Text>
				{hint ? (
					<Text style={styles.correctionHint}>{hint}</Text>
				) : null}
			</View>
		</View>
	);
}

function LevelPills({ activeIndex }: { activeIndex: number }) {
	return (
		<View style={styles.levelPills}>
			{CEFR_ORDER.map((code, i) => {
				const filled = activeIndex >= 0 && i <= activeIndex;
				return (
					<View
						key={code}
						style={[
							styles.levelPill,
							filled && styles.levelPillFilled,
						]}
					/>
				);
			})}
		</View>
	);
}

export default function SessionAnalysisScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const rawId = useLocalSearchParams<{ sessionId?: string | string[] }>()
		.sessionId;
	const sessionId = Array.isArray(rawId) ? rawId[0] : rawId;

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [detail, setDetail] = useState<SessionDetail | null>(null);

	const load = useCallback(async () => {
		if (!sessionId) {
			setError("Missing session");
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const row = await getSessionById(sessionId);
			console.log("loaded session detail", row);
			if (!row) {
				setError("Session not found");
				setDetail(null);
			} else {
				setDetail(row);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not load session");
			setDetail(null);
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		void load();
	}, [load]);

	const analysis = detail?.analysis;
	const scores = analysis?.scores;

	const headline = useMemo(() => {
		if (!scores) return "";
		return analysisFeedbackHeadline(scores.overall);
	}, [scores]);

	const subtitle = useMemo(() => {
		if (!analysis) return "";
		return analysisFeedbackSubtitle(analysis);
	}, [analysis]);

	const cefrCode = (analysis?.cefr_level ?? "B1")
		.trim()
		.toUpperCase()
		.slice(0, 2);
	const levelIdx = cefrIndex(analysis?.cefr_level ?? "B1");

	if (loading) {
		return (
			<View
				style={[
					styles.centered,
					{ paddingTop: insets.top, paddingBottom: insets.bottom },
				]}
			>
				<ActivityIndicator size="large" color={app.buttonPrimary} />
				<Text style={styles.loadingText}>Loading analysis…</Text>
			</View>
		);
	}

	if (error || !detail || !analysis || !scores) {
		return (
			<View
				style={[
					styles.centered,
					{
						paddingTop: insets.top,
						paddingBottom: insets.bottom,
						paddingHorizontal: 24,
					},
				]}
			>
				<Text style={styles.errorText}>
					{error ?? "No analysis for this session."}
				</Text>
				<Pressable style={styles.homeBtn} onPress={() => router.back()}>
					<Text style={styles.homeBtnText}>Go back</Text>
				</Pressable>
			</View>
		);
	}

	const corrections = analysis.corrected_examples.slice(0, 5);
	const hints = analysis.suggestions;

	return (
		<View style={[styles.root, { paddingTop: insets.top }]}>
			<View style={styles.header}>
				<Pressable
					hitSlop={12}
					onPress={() => router.back()}
					style={styles.headerIcon}
				>
					<Ionicons name="arrow-back" size={24} color={white} />
				</Pressable>
				<Text style={styles.headerTitle}>Session Analysis</Text>
			</View>

			<ScrollView
				contentContainerStyle={[
					styles.scroll,
					{ paddingBottom: insets.bottom + 24 },
				]}
				showsVerticalScrollIndicator={false}
			>
				<View style={styles.hero}>
					<View style={styles.ringStack}>
						{/* <ScoreRing progress={scores.overall} /> */}
						<View style={styles.ringCenter}>
							<Text style={styles.scoreHuge}>
								{scores.overall.toFixed(1)}
							</Text>
							<Text style={styles.scoreSub}>out of 10</Text>
						</View>
					</View>
					<Text style={styles.feedTitle}>{headline}</Text>
					<Text style={styles.feedSub}>{subtitle}</Text>
				</View>

				<View style={styles.card}>
					<ScoreBar
						label="Grammar"
						score={scores.grammar}
						color={BAR_COLORS.grammar}
					/>
					<ScoreBar
						label="Fluency"
						score={scores.fluency}
						color={BAR_COLORS.fluency}
					/>
					<ScoreBar
						label="Pronunciation"
						score={scores.pronunciation}
						color={BAR_COLORS.pronunciation}
					/>
					<ScoreBar
						label="Vocabulary"
						score={scores.vocabulary}
						color={BAR_COLORS.vocabulary}
					/>
					<ScoreBar
						label="Coherence"
						score={scores.coherence}
						color={BAR_COLORS.coherence}
					/>
				</View>

				<Text style={styles.sectionEyebrow}>LEVEL ASSESSMENT</Text>
				<View style={styles.card}>
					<View style={styles.levelRow}>
						<Text style={styles.levelCode}>{cefrCode}</Text>
						<Text style={styles.levelName}>
							{cefrLabel(cefrCode)}
						</Text>
					</View>
					<LevelPills activeIndex={levelIdx} />
				</View>

				{corrections.length > 0 ? (
					<>
						<Text style={styles.sectionEyebrow}>
							KEY CORRECTIONS
						</Text>
						<View style={styles.correctionsList}>
							{corrections.map((c, i) => (
								<CorrectionCard
									key={`${c.original}-${i}`}
									original={`"${c.original}"`}
									corrected={`"${c.corrected}"`}
									hint={hints[i] ?? ""}
								/>
							))}
						</View>
					</>
				) : null}
			</ScrollView>
		</View>
	);
}

const serif = Platform.select({
	ios: "Georgia",
	android: "serif",
	default: undefined,
});

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: colors.slate[950],
	},
	centered: {
		flex: 1,
		backgroundColor: colors.slate[950],
		alignItems: "center",
		justifyContent: "center",
		gap: 12,
	},
	loadingText: {
		color: app.textMuted,
		fontSize: 15,
	},
	errorText: {
		color: "#fca5a5",
		fontSize: 16,
		textAlign: "center",
		marginBottom: 16,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingBottom: 8,
	},
	headerIcon: {
		width: 44,
		height: 44,
		alignItems: "center",
		justifyContent: "center",
	},
	headerTitle: {
		color: white,
		fontSize: 24,
		fontWeight: "600",
	},
	scroll: {
		paddingHorizontal: 20,
	},
	hero: {
		alignItems: "center",
		marginBottom: 28,
	},
	ringWrap: {
		alignItems: "center",
		justifyContent: "center",
	},
	ringStack: {
		width: RING_SIZE,
		height: RING_SIZE,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 8,
	},
	ringCenter: {
		position: "absolute",
		alignItems: "center",
		justifyContent: "center",
	},
	scoreHuge: {
		fontSize: 52,
		fontWeight: "700",
		color: white,
		fontFamily: serif,
	},
	scoreSub: {
		color: app.textMuted,
		fontSize: 14,
		marginTop: 2,
	},
	feedTitle: {
		fontSize: 26,
		fontWeight: "700",
		color: white,
		marginTop: 12,
		textAlign: "center",
	},
	feedSub: {
		color: app.textMuted,
		fontSize: 15,
		lineHeight: 22,
		textAlign: "center",
		marginTop: 8,
		paddingHorizontal: 12,
	},
	card: {
		backgroundColor: "#111934",
		borderRadius: 20,
		borderWidth: 1,
		borderColor: "#2a3561",
		padding: 18,
		gap: 18,
		marginBottom: 24,
	},
	barBlock: {
		gap: 8,
	},
	barHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	barDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	barLabel: {
		flex: 1,
		color: white,
		fontSize: 16,
		fontWeight: "600",
	},
	barValue: {
		color: app.textMuted,
		fontSize: 15,
		fontWeight: "600",
	},
	barTrack: {
		height: 8,
		borderRadius: 4,
		backgroundColor: "#1e293b",
		overflow: "hidden",
	},
	barFill: {
		height: "100%",
		borderRadius: 4,
	},
	sectionEyebrow: {
		fontSize: 12,
		fontWeight: "700",
		color: app.textMuted,
		letterSpacing: 1,
		marginBottom: 12,
	},
	levelRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 12,
		marginBottom: 16,
	},
	levelCode: {
		fontSize: 40,
		fontWeight: "700",
		color: white,
		fontFamily: serif,
	},
	levelName: {
		fontSize: 16,
		color: app.textMuted,
	},
	levelPills: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 14,
	},
	levelPill: {
		flex: 1,
		height: 10,
		borderRadius: 5,
		backgroundColor: "#2a3561",
	},
	levelPillFilled: {
		backgroundColor: colors.purple[500],
	},
	correctionsList: {
		gap: 12,
		marginBottom: 24,
	},
	correctionCard: {
		flexDirection: "row",
		backgroundColor: "#111934",
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#2a3561",
		padding: 14,
		gap: 12,
	},
	correctionIcon: {
		width: 28,
		height: 28,
		borderRadius: 14,
		backgroundColor: colors.rose[500],
		alignItems: "center",
		justifyContent: "center",
	},
	correctionBody: {
		flex: 1,
		gap: 6,
	},
	correctionWrong: {
		color: colors.rose[300],
		textDecorationLine: "line-through",
		fontSize: 15,
	},
	correctionRight: {
		color: colors.emerald[400],
		fontSize: 15,
		fontWeight: "600",
	},
	correctionHint: {
		color: app.textMuted,
		fontSize: 13,
		lineHeight: 18,
	},
	homeBtn: {
		marginTop: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
	},
	homeBtnText: {
		color: app.buttonPrimary,
		fontSize: 16,
		fontWeight: "600",
	},
});
