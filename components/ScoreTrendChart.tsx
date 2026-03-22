import { app, scoreTrendChart } from "@/constants/colors";
import type { SessionListItem } from "@/services/session";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import {
	Easing,
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

function paletteIndex(i: number, n: number): number {
	if (n <= 1) return 0;
	const t = i / (n - 1);
	const len = scoreTrendChart.barGradients.length;
	return Math.min(len - 1, Math.round(t * (len - 1)));
}

function barGradientAt(i: number, n: number): [string, string] {
	const j = paletteIndex(i, n);
	return [...scoreTrendChart.barGradients[j]!] as [string, string];
}

/** Score labels use the lighter (top) stop so they match each bar’s highlight. */
function labelColorAt(i: number, n: number): string {
	const j = paletteIndex(i, n);
	const pair = scoreTrendChart.barGradients[j];
	return pair?.[1] ?? app.textMuted;
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

export function ScoreTrendChart({ sessions }: Props) {
	const { width: windowWidth } = useWindowDimensions();
	const chartWidth = Math.max(200, windowWidth - CHART_WIDTH_INSET);

	const { scores, average, delta, nBars, chartData } = useMemo(() => {
		const scores = buildSeries(sessions);
		const nums = scores.filter((x): x is number => x != null);
		const average =
			nums.length > 0
				? nums.reduce((a, b) => a + b, 0) / nums.length
				: null;
		const delta =
			nums.length >= 2 ? nums[nums.length - 1]! - nums[0]! : 0;
		const nBars = scores.length;

		const chartData = scores.map((score, i) => {
			const [g0, g1] = barGradientAt(i, nBars);
			const scoreColor = labelColorAt(i, nBars);
			const has = score != null;
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

		return { scores, average, delta, nBars, chartData };
	}, [sessions]);

	const hasAny = scores.some((s) => s != null);

	if (!hasAny) {
		return (
			<View style={styles.card}>
				<Text style={styles.sectionEyebrow}>SCORE TREND</Text>
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
		marginBottom: 16,
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
