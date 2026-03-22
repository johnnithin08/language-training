import {
	app,
	SCORE_BANDS,
	scoreBarGradient,
	scoreChartLabelColor,
	scoreTrendChart,
} from "@/constants/colors";
import type { SessionListItem } from "@/services/session";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
	Easing,
	Pressable,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { BarChart } from "react-native-gifted-charts";

const CHART_HEIGHT = 168;
const MAX_SESSIONS = 10;
/** Scroll horizontal padding (24*2) + card horizontal padding (18*2) */
const CHART_WIDTH_INSET = 84;

export type ScoreTrendRange = "this_month" | "last_3_months";

/** Filter sessions by `createdAt` (local calendar): this month, or current month plus two prior months. */
function filterSessionsByRange(
	items: SessionListItem[],
	range: ScoreTrendRange,
): SessionListItem[] {
	if (items.length === 0) return [];
	const now = new Date();
	const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const threeMonthsStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
	const cutoff = range === "this_month" ? thisMonthStart : threeMonthsStart;
	const t = cutoff.getTime();
	return items.filter((s) => new Date(s.createdAt).getTime() >= t);
}

/** Last N sessions chronologically (oldest → newest); length ≤ MAX_SESSIONS, no padding. */
function buildSeries(items: SessionListItem[]): (number | null)[] {
	const chrono = [...items].sort(
		(a, b) =>
			new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);
	return chrono.slice(-MAX_SESSIONS).map((s) =>
		s?.analysis?.scores?.overall != null
			? s.analysis.scores.overall
			: null,
	);
}

type Props = {
	sessions: SessionListItem[];
};

const RANGE_OPTIONS: { key: ScoreTrendRange; label: string }[] = [
	{ key: "this_month", label: "This month" },
	{ key: "last_3_months", label: "Last 3 months" },
];

export function ScoreTrendChart({ sessions }: Props) {
	const [range, setRange] = useState<ScoreTrendRange>("last_3_months");
	const { width: windowWidth } = useWindowDimensions();
	const chartWidth = Math.max(200, windowWidth - CHART_WIDTH_INSET);

	const filteredSessions = useMemo(
		() => filterSessionsByRange(sessions, range),
		[sessions, range],
	);

	const { scores, average, delta, chartData } = useMemo(() => {
		const scores = buildSeries(filteredSessions);
		const nums = scores.filter((x): x is number => x != null);
		const average =
			nums.length > 0
				? nums.reduce((a, b) => a + b, 0) / nums.length
				: null;
		const delta =
			nums.length >= 2 ? nums[nums.length - 1]! - nums[0]! : 0;

		const chartData = scores.map((score, i) => {
			const has = score != null;
			const [g0, g1] = has
				? scoreBarGradient(score)
				: (["transparent", "transparent"] as [string, string]);
			const scoreColor = has
				? scoreChartLabelColor(score)
				: app.textMuted;
			return {
				value: has ? score : 0,
				label: `S${i + 1}`,
				frontColor: has ? g0 : "transparent",
				gradientColor: has ? g1 : "transparent",
				showGradient: has,
				barBorderTopLeftRadius: 8,
				barBorderTopRightRadius: 8,
				barBorderBottomLeftRadius: 0,
				barBorderBottomRightRadius: 0,
				barBorderRadius: 8,
				labelTextStyle: styles.xAxisLabel,
				topLabelComponent: () => (
					<Text
						style={[
							styles.scoreTopLabel,
							{ color: has ? scoreColor : app.textMuted },
						]}
						numberOfLines={1}
					>
						{has ? score.toFixed(1) : "—"}
					</Text>
				),
			};
		});

		return { scores, average, delta, chartData };
	}, [filteredSessions]);

	const hasAny = scores.some((s) => s != null);
	const hasSessionsInRange = filteredSessions.length > 0;

	const filterRow =
		sessions.length > 0 ? (
			<View style={styles.filterRow}>
				{RANGE_OPTIONS.map((opt) => {
					const active = range === opt.key;
					return (
						<Pressable
							key={opt.key}
							onPress={() => setRange(opt.key)}
							style={({ pressed }) => [
								styles.filterPill,
								active ? styles.filterPillActive : styles.filterPillIdle,
								pressed && styles.filterPillPressed,
							]}
						>
							<Text
								style={
									active ? styles.filterPillTextActive : styles.filterPillTextIdle
								}
							>
								{opt.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		) : null;

	if (!sessions.length) {
		return (
			<View style={styles.card}>
				<Text style={styles.sectionEyebrow}>SCORE TREND</Text>
				<Text style={styles.empty}>
					Complete a few sessions to see your score trend here.
				</Text>
			</View>
		);
	}

	if (!hasSessionsInRange) {
		return (
			<View style={styles.card}>
				<Text style={styles.sectionEyebrow}>SCORE TREND</Text>
				{filterRow}
				<Text style={styles.empty}>
					No sessions in this period. Try the other range or keep practicing.
				</Text>
			</View>
		);
	}

	if (!hasAny) {
		return (
			<View style={styles.card}>
				<Text style={styles.sectionEyebrow}>SCORE TREND</Text>
				{filterRow}
				<Text style={styles.empty}>
					Complete a few sessions to see your score trend here.
				</Text>
			</View>
		);
	}

	return (
		<View style={styles.card}>
			<View style={styles.cardHeader}>
				<Text style={styles.sectionEyebrow}>SCORE TREND</Text>
				<View style={styles.trendBadge}>
					<Ionicons
						name={delta >= 0 ? "trending-up" : "trending-down"}
						size={18}
						color={scoreTrendChart.accent}
					/>
					<Text style={styles.trendValue}>
						{delta >= 0 ? "+" : ""}
						{delta.toFixed(1)}
					</Text>
				</View>
			</View>

			{filterRow}

			<View style={styles.chartWrap}>
				<BarChart
					data={chartData}
					width={chartWidth}
					height={CHART_HEIGHT}
					maxValue={10}
					noOfSections={4}
					stepValue={2.5}
					parentWidth={chartWidth}
					adjustToWidth
					disableScroll
					initialSpacing={6}
					spacing={4}
					isAnimated
					animationDuration={900}
					animationEasing={Easing.out(Easing.cubic)}
					backgroundColor="transparent"
					rulesColor={scoreTrendChart.rules}
					rulesThickness={1}
					hideYAxisText
					yAxisThickness={0}
					yAxisColor="transparent"
					yAxisLabelWidth={0}
					xAxisColor={scoreTrendChart.xAxis}
					xAxisThickness={1}
					labelsExtraHeight={6}
					xAxisTextNumberOfLines={1}
				/>
			</View>

			<View style={styles.legend}>
				{SCORE_BANDS.map((band) => (
					<View key={band.key} style={styles.legendItem}>
						<View
							style={[
								styles.legendSwatch,
								{
									backgroundColor: band.solid,
								},
							]}
						/>
						<View style={styles.legendTextCol}>
							<Text style={styles.legendLabel}>{band.label}</Text>
							<Text style={styles.legendRange}>{band.rangeLabel}</Text>
						</View>
					</View>
				))}
			</View>

			<View style={styles.footer}>
				<View style={styles.footerLeft}>
					<View style={styles.footerDot} />
					<Text style={styles.footerLabel}>Average Score</Text>
				</View>
				<Text style={styles.footerAvg}>
					{average != null ? `${average.toFixed(1)}/10` : "—"}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: scoreTrendChart.cardBackground,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: scoreTrendChart.cardBorder,
		padding: 18,
		marginBottom: 28,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	filterRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 16,
	},
	filterPill: {
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 999,
		borderWidth: 1,
	},
	filterPillActive: {
		backgroundColor: "rgba(61, 212, 200, 0.14)",
		borderColor: scoreTrendChart.accent,
	},
	filterPillIdle: {
		backgroundColor: "transparent",
		borderColor: scoreTrendChart.cardBorder,
	},
	filterPillPressed: {
		opacity: 0.85,
	},
	filterPillTextActive: {
		fontSize: 13,
		fontWeight: "700",
		color: scoreTrendChart.accent,
	},
	filterPillTextIdle: {
		fontSize: 13,
		fontWeight: "600",
		color: app.textMuted,
	},
	sectionEyebrow: {
		fontSize: 12,
		fontWeight: "700",
		color: app.textMuted,
		letterSpacing: 1.2,
	},
	trendBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	trendValue: {
		fontSize: 16,
		fontWeight: "700",
		color: scoreTrendChart.accent,
	},
	chartWrap: {
		marginBottom: 4,
		overflow: "visible",
		alignItems: "center",
	},
	legend: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		gap: 10,
		marginTop: 8,
		marginBottom: 4,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		minWidth: "28%",
		flexGrow: 1,
	},
	legendSwatch: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	legendTextCol: {
		flexShrink: 1,
	},
	legendLabel: {
		fontSize: 11,
		fontWeight: "700",
		color: app.textPrimary,
	},
	legendRange: {
		fontSize: 10,
		fontWeight: "600",
		color: app.textMuted,
		marginTop: 1,
	},
	scoreTopLabel: {
		fontSize: 11,
		fontWeight: "700",
		textAlign: "center",
		marginBottom: 4,
	},
	xAxisLabel: {
		fontSize: 12,
		fontWeight: "600",
		color: app.textMuted,
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: 12,
		paddingTop: 14,
		borderTopWidth: 1,
		borderTopColor: scoreTrendChart.cardBorder,
	},
	footerLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		flexShrink: 1,
	},
	/** Accent dot beside “Average Score” (blue, like the reference UI). */
	footerDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: scoreTrendChart.footerDot,
	},
	footerLabel: {
		fontSize: 15,
		fontWeight: "600",
		color: app.textMuted,
	},
	footerAvg: {
		fontSize: 24,
		fontWeight: "700",
		color: scoreTrendChart.accent,
		letterSpacing: -0.3,
	},
	empty: {
		color: app.textMuted,
		fontSize: 15,
		lineHeight: 22,
	},
});
