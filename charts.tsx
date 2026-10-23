// Small bar charts built from plain views. Single hue (magnitude), thin bars with
// rounded data ends, recessive axes, hover tooltips, and a table nearby on every screen.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/theme";

export interface BarDatum {
  label: string;
  value: number;
  display: string;
  secondary?: string; // shown after the value, e.g. deal count
}

/** Horizontal bars: good for ranked categories like stages or reps. */
export function HBarChart({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View role="img" aria-label={ariaLabel} style={{ gap: 10 }}>
      {data.map((d) => (
        <View key={d.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
              {d.label}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>
              {d.display}
              {d.secondary ? `  ·  ${d.secondary}` : ""}
            </Text>
          </View>
          <View style={{ height: 8, backgroundColor: "#eef1f5", borderRadius: 4 }}>
            <View
              style={{
                height: 8,
                width: `${(d.value / max) * 100}%`,
                minWidth: d.value > 0 ? 4 : 0,
                backgroundColor: colors.primary,
                borderRadius: 4,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export interface ColumnDatum {
  label: string;
  total: number;
  part?: number; // drawn inside the total bar (e.g. weighted inside total)
  tooltip: string[];
}

/** Vertical columns over time. When `part` is set, it is drawn as the darker portion of the bar. */
export function ColumnChart({
  data,
  format,
  ariaLabel,
  legend,
  height = 180,
}: {
  data: ColumnDatum[];
  format: (n: number) => string;
  ariaLabel: string;
  legend?: { total: string; part: string };
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const ticks = [max, max / 2, 0];
  return (
    <View role="img" aria-label={ariaLabel} style={{ gap: 10 }}>
      {legend ? (
        <View style={{ flexDirection: "row", gap: 16 }}>
          <LegendSwatch color={colors.primary} label={legend.part} />
          <LegendSwatch color={colors.primaryTint} label={legend.total} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ height, justifyContent: "space-between", alignItems: "flex-end", width: 52 }}>
          {ticks.map((t, i) => (
            <Text key={i} style={{ fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"] }}>
              {format(t)}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 2, borderBottomWidth: 1, borderBottomColor: colors.borderStrong }}>
            {data.map((d, i) => (
              <Pressable
                key={d.label}
                onHoverIn={() => setHover(i)}
                onHoverOut={() => setHover((h) => (h === i ? null : h))}
                onPress={() => setHover((h) => (h === i ? null : i))}
                style={{ flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }}
                aria-label={`${d.label}: ${d.tooltip.join(", ")}`}
              >
                {hover === i ? (
                  <View
                    style={{
                      position: "absolute",
                      bottom: Math.min(height - 10, (d.total / max) * height + 6),
                      backgroundColor: colors.text,
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      zIndex: 10,
                      minWidth: 120,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{d.label}</Text>
                    {d.tooltip.map((t) => (
                      <Text key={t} style={{ color: "#dfe6f0", fontSize: 12 }}>
                        {t}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View
                  style={{
                    width: "70%",
                    maxWidth: 28,
                    height: `${(d.total / max) * 100}%`,
                    minHeight: d.total > 0 ? 3 : 0,
                    backgroundColor: d.part != null ? colors.primaryTint : colors.primary,
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    justifyContent: "flex-end",
                    overflow: "hidden",
                    opacity: hover == null || hover === i ? 1 : 0.6,
                  }}
                >
                  {d.part != null ? (
                    <View style={{ height: `${d.total ? (d.part / d.total) * 100 : 0}%`, backgroundColor: colors.primary }} />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 2, marginTop: 4 }}>
            {data.map((d) => (
              <Text key={d.label} style={{ flex: 1, fontSize: 11, color: colors.textMuted, textAlign: "center" }} numberOfLines={1}>
                {d.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}
