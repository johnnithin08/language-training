import { app, SCORE_BANDS, scoreTrendChart } from "@/constants/colors";
import type { SessionListItem } from "@/services/session";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LineChart } from "react-native-gifted-charts";

const CHART_HEIGHT = 180;
const MAX_POINTS = 6;
const CHART_WIDTH_INSET = 84;
const LINE_COLOR = "#3dd4c8";
const DOT_COLOR = "#3dd4c8";
const AREA_TOP = "rgba(61,212,200,0.25)";
const AREA_BOTTOM = "rgba(61,212,200,0.02)";
const Y_AXIS_WIDTH = 28;

const yAxisLabelStyle = {
  fontSize: 11,
  fontWeight: "600" as const,
  color: "#94a3b8",
};

const REF_LINE_DEVELOPING = {
  color: "rgba(249,115,22,0.45)",
  dashWidth: 12,
  dashGap: 6,
  thickness: 1.5,
};
const REF_LINE_STRONG = {
  color: "rgba(45,212,191,0.45)",
  dashWidth: 12,
  dashGap: 6,
  thickness: 1.5,
};

export type ScoreTrendRange = "this_month" | "last_3_months";

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

/**
 * Build up to MAX_POINTS data values from sessions.
 * If there are more sessions than MAX_POINTS, bucket them
 * into equal groups and average each group's scores.
 */
function buildSeries(items: SessionListItem[]): (number | null)[] {
  const chrono = [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const all = chrono.map((s) =>
    s?.analysis?.scores?.overall != null ? s.analysis.scores.overall : null,
  );

  if (all.length <= MAX_POINTS) return all;

  const bucketSize = all.length / MAX_POINTS;
  const result: (number | null)[] = [];
  for (let i = 0; i < MAX_POINTS; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.floor((i + 1) * bucketSize);
    const bucket = all.slice(start, end).filter((x): x is number => x != null);
    if (bucket.length > 0) {
      result.push(
        +(bucket.reduce((a, b) => a + b, 0) / bucket.length).toFixed(1),
      );
    } else {
      result.push(null);
    }
  }
  return result;
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
      nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    const delta = nums.length >= 2 ? nums[nums.length - 1]! - nums[0]! : 0;

    const chartData = scores.map((score) => ({
      value: score ?? 0,
      hideDataPoint: score == null,
    }));

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
                  active
                    ? styles.filterPillTextActive
                    : styles.filterPillTextIdle
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
        <LineChart
          data={chartData}
          width={chartWidth - Y_AXIS_WIDTH - 15}
          height={CHART_HEIGHT}
          maxValue={10}
          noOfSections={5}
          stepValue={2}
          //   adjustToWidth
          disableScroll
          initialSpacing={12}
          endSpacing={20}
          isAnimated
          animationDuration={800}
          color={LINE_COLOR}
          thickness={2.5}
          curved
          curvature={0.2}
          areaChart
          startFillColor={AREA_TOP}
          endFillColor={AREA_BOTTOM}
          startOpacity={0.6}
          endOpacity={0}
          dataPointsColor={DOT_COLOR}
          dataPointsRadius={5}
          showValuesAsDataPointsText
          textColor={LINE_COLOR}
          textFontSize={11}
          textShiftY={-12}
          textShiftX={-1}
          backgroundColor="transparent"
          rulesColor={scoreTrendChart.rules}
          rulesThickness={1}
          yAxisThickness={0}
          yAxisColor="transparent"
          yAxisLabelWidth={Y_AXIS_WIDTH}
          yAxisTextStyle={yAxisLabelStyle}
          xAxisColor={scoreTrendChart.xAxis}
          xAxisThickness={1}
          hideAxesAndRules={false}
          xAxisLabelsHeight={0}
          showReferenceLine1
          referenceLine1Position={5}
          referenceLine1Config={REF_LINE_DEVELOPING}
          showReferenceLine2
          referenceLine2Position={7.5}
          referenceLine2Config={REF_LINE_STRONG}
        />
      </View>

      <View style={styles.legend}>
        {SCORE_BANDS.map((band) => (
          <View key={band.key} style={styles.legendItem}>
            <View
              style={[styles.legendSwatch, { backgroundColor: band.solid }]}
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
    paddingRight: 16,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
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
    color: "#e2e8f0",
  },
  legendRange: {
    fontSize: 10,
    fontWeight: "600",
    color: app.textMuted,
    marginTop: 1,
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
