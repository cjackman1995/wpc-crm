import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { colors, font, radius } from "@/theme";

// ---------------------------------------------------------------- layout

export function Screen({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const pad = width < 700 ? 16 : 28;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: pad, gap: 20, paddingBottom: 48 }}>
      <View style={s.header}>
        <View style={{ flexShrink: 1, minWidth: 200 }}>
          <Text style={s.title} role="heading" aria-level={1}>
            {title}
          </Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={s.actions}>{actions}</View> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({
  title,
  right,
  children,
  style,
  padded = true,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[s.card, style]}>
      {title || right ? (
        <View style={s.cardHeader}>
          {title ? <Text style={s.cardTitle}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      <View style={padded ? { padding: 16 } : undefined}>{children}</View>
    </View>
  );
}

/** Wraps children into responsive columns: stacks on narrow screens. */
export function Grid({ children, min = 280, gap = 16 }: { children: ReactNode; min?: number; gap?: number }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>{wrapChildren(children, min)}</View>;
}
function wrapChildren(children: ReactNode, min: number) {
  const arr = Array.isArray(children) ? children : [children];
  return arr.filter(Boolean).map((c, i) => (
    <View key={i} style={{ flexGrow: 1, flexShrink: 1, flexBasis: min, minWidth: Math.min(min, 260) }}>
      {c}
    </View>
  ));
}

export function Row({ children, gap = 8, style, wrap = true }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap, flexWrap: wrap ? "wrap" : "nowrap" }, style]}>{children}</View>;
}

// ---------------------------------------------------------------- text & status

export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

type Tone = "neutral" | "primary" | "good" | "warn" | "bad";
const toneColors: Record<Tone, [string, string]> = {
  neutral: ["#eef1f5", colors.textSecondary],
  primary: [colors.primarySoft, colors.primaryDark],
  good: [colors.goodSoft, colors.good],
  warn: [colors.warnSoft, colors.warn],
  bad: [colors.badSoft, colors.bad],
};

export function Badge({ text, tone = "neutral" }: { text: string; tone?: Tone }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function ErrorBox({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <View style={s.error} role="alert">
      <Text style={{ color: colors.bad, fontWeight: "600" }}>{message}</Text>
    </View>
  );
}

export function Notice({ children, tone = "primary" }: { children: ReactNode; tone?: Tone }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View style={{ backgroundColor: bg, padding: 12, borderRadius: radius }}>
      <Text style={{ color: fg }}>{children}</Text>
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
      <ActivityIndicator color={colors.primary} />
      <Muted>{label}</Muted>
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={{ padding: 28, alignItems: "center", gap: 6 }}>
      <Text style={{ fontWeight: "600", color: colors.text }}>{title}</Text>
      {children ? <Muted style={{ textAlign: "center" }}>{children}</Muted> : null}
    </View>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={[s.card, { padding: 16, gap: 4 }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {sub ? <Muted>{sub}</Muted> : null}
    </View>
  );
}

// ---------------------------------------------------------------- controls

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  variant = "secondary",
  disabled,
  small,
  busy,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  small?: boolean;
  busy?: boolean;
}) {
  const v = buttonVariants[variant];
  const off = disabled || busy;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      role="button"
      aria-disabled={off}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
        s.button,
        small && { paddingVertical: 5, paddingHorizontal: 10 },
        { backgroundColor: hovered || pressed ? v.hover : v.bg, borderColor: v.border },
        off && { opacity: 0.55 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={v.fg} /> : null}
      <Text style={{ color: v.fg, fontWeight: "600", fontSize: small ? 13 : 14 }}>{label}</Text>
    </Pressable>
  );
}
const buttonVariants: Record<Variant, { bg: string; hover: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, hover: colors.primaryDark, fg: "#fff", border: colors.primary },
  secondary: { bg: "#fff", hover: colors.surfaceAlt, fg: colors.text, border: colors.borderStrong },
  danger: { bg: "#fff", hover: colors.badSoft, fg: colors.bad, border: "#e8b4b1" },
  ghost: { bg: "transparent", hover: colors.primarySoft, fg: colors.primaryDark, border: "transparent" },
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  secure,
  keyboardType,
  autoFocus,
  onSubmit,
  style,
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "decimal-pad";
  autoFocus?: boolean;
  onSubmit?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 4 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={label}
        style={[s.input, multiline && { minHeight: 90, textAlignVertical: "top" }, focused && s.inputFocus]}
      />
    </View>
  );
}

const domInput: CSSProperties = {
  font: `14px ${font.family}`,
  color: colors.text,
  background: "#fff",
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius - 2,
  padding: "7px 10px",
  minHeight: 36,
  boxSizing: "border-box",
  width: "100%",
};

export interface Option {
  value: string;
  label: string;
}

/** Native browser <select>; this app targets the web. */
export function Select({
  label,
  value,
  onChange,
  options,
  style,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 4 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...domInput, paddingRight: 28 }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
  style,
}: {
  label?: string;
  value: string; // YYYY-MM-DD or ""
  onChange: (v: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 4 }, style]}>
      {label ? <Label>{label}</Label> : null}
      <input aria-label={label} type="date" value={value} onChange={(e) => onChange(e.target.value)} style={domInput} />
    </View>
  );
}

export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!checked)} role="checkbox" aria-checked={checked} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          borderWidth: 1.5,
          borderColor: checked ? colors.primary : colors.borderStrong,
          backgroundColor: checked ? colors.primary : "#fff",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", lineHeight: 14 }}>✓</Text> : null}
      </View>
      <Text style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

/** Segmented control for a handful of choices. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <View style={s.segment} role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} role="tab" aria-selected={on} style={[s.segmentItem, on && s.segmentOn]}>
            <Text style={{ color: on ? colors.text : colors.textSecondary, fontWeight: on ? "600" : "500", fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- table

export interface Column<T> {
  key: string;
  label: string;
  width?: number;
  flex?: number;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowPress,
  empty = "Nothing here yet.",
  initialSort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  onRowPress?: (r: T) => void;
  empty?: string;
  initialSort?: { key: string; dir: 1 | -1 };
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | undefined>(initialSort);
  const minWidth = columns.reduce((sum, c) => sum + (c.width ?? 140), 0);
  let sorted = rows;
  const sc = sort && columns.find((c) => c.key === sort.key);
  if (sc?.sortValue) {
    const get = sc.sortValue;
    sorted = [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort!.dir;
    });
  }
  const cellStyle = (c: Column<T>): ViewStyle => ({
    width: c.flex ? undefined : c.width ?? 140,
    flex: c.flex,
    minWidth: c.flex ? c.width ?? 140 : undefined,
    paddingHorizontal: 10,
    alignItems: c.align === "right" ? "flex-end" : "flex-start",
    justifyContent: "center",
  });
  return (
    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ minWidth, flexGrow: 1 }} role="table">
        <View style={s.thead} role="row">
          {columns.map((c) => (
            <Pressable
              key={c.key}
              style={cellStyle(c)}
              role="columnheader"
              onPress={c.sortValue ? () => setSort((p) => ({ key: c.key, dir: p?.key === c.key ? (p.dir === 1 ? -1 : 1) : 1 })) : undefined}
            >
              <Text style={s.th}>
                {c.label}
                {sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
              </Text>
            </Pressable>
          ))}
        </View>
        {sorted.length === 0 ? <Empty title={empty} /> : null}
        {sorted.map((r) => (
          <Pressable
            key={rowKey(r)}
            onPress={onRowPress ? () => onRowPress(r) : undefined}
            role="row"
            style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [s.tr, hovered && onRowPress ? { backgroundColor: colors.surfaceAlt } : null]}
          >
            {columns.map((c) => (
              <View key={c.key} style={cellStyle(c)} role="cell">
                {wrapText(c.render(r), c.align)}
              </View>
            ))}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function wrapText(node: ReactNode, align?: "left" | "right") {
  if (typeof node === "string" || typeof node === "number") {
    return (
      <Text style={[s.td, align === "right" && { textAlign: "right", fontVariant: ["tabular-nums"] }]} numberOfLines={2}>
        {node}
      </Text>
    );
  }
  return node;
}

// ---------------------------------------------------------------- styles

const s = StyleSheet.create({
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
  subtitle: { color: colors.textSecondary, marginTop: 4, fontSize: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  card: { backgroundColor: colors.surface, borderRadius: radius, borderWidth: 1, borderColor: colors.border },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
    flexWrap: "wrap",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  label: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  muted: { color: colors.textSecondary, fontSize: 13 },
  kpiLabel: { fontSize: 12, fontWeight: "600", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  kpiValue: { fontSize: 26, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] },
  error: { backgroundColor: colors.badSoft, borderRadius: radius, padding: 12, borderWidth: 1, borderColor: "#f1c4c1" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius - 2,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius - 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: "#fff",
    minHeight: 36,
  },
  inputFocus: { borderColor: colors.primary, outlineColor: colors.primary } as ViewStyle,
  segment: { flexDirection: "row", backgroundColor: "#e7ebf1", borderRadius: radius, padding: 3, alignSelf: "flex-start", flexWrap: "wrap" },
  segmentItem: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius - 2 },
  segmentOn: { backgroundColor: "#fff", boxShadow: "0 1px 2px rgba(15,27,45,0.12)" } as ViewStyle,
  thead: { flexDirection: "row", paddingVertical: 10, backgroundColor: colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  tr: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 44 },
  td: { fontSize: 14, color: colors.text },
});
