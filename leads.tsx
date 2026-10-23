import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { useRefData } from "@/lib/data";
import { pct } from "@/lib/format";
import type { Lead, LeadInput, Stage } from "@/lib/types";
import { colors } from "@/theme";
import { Badge, Button, DateField, ErrorBox, Field, Grid, Row, Select, type Option } from "./ui";

export function StageBadge({ stage }: { stage: Stage | undefined }) {
  if (!stage) return <Badge text="—" />;
  return <Badge text={stage.name} tone={stage.is_won ? "good" : stage.is_closed ? "bad" : "primary"} />;
}

/** Salesforce-style stage path: click a step to move the lead there. */
export function StagePath({ stages, current, onPick, disabled }: { stages: Stage[]; current: number; onPick: (s: Stage) => void; disabled?: boolean }) {
  const cur = stages.find((s) => s.id === current);
  const open = stages.filter((s) => !s.is_closed);
  const closed = stages.filter((s) => s.is_closed);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }} role="list" aria-label="Stages">
      {[...open, ...closed].map((s) => {
        const isCur = s.id === current;
        const passed = cur && !cur.is_closed && s.sort_order < cur.sort_order && !s.is_closed;
        const wonPassed = cur?.is_won && !s.is_closed;
        const bg = isCur ? (s.is_won ? colors.good : s.is_closed ? colors.bad : colors.primary) : passed || wonPassed ? colors.primarySoft : "#eef1f5";
        const fg = isCur ? "#fff" : passed || wonPassed ? colors.primaryDark : colors.textSecondary;
        return (
          <Pressable
            key={s.id}
            role="listitem"
            aria-current={isCur ? "step" : undefined}
            onPress={disabled || isCur ? undefined : () => onPick(s)}
            style={({ hovered }: { hovered?: boolean; pressed: boolean }) => ({
              backgroundColor: hovered && !isCur && !disabled ? "#dfe6ef" : bg,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 4,
              marginLeft: s.is_closed && s === closed[0] ? 10 : 0,
            })}
          >
            <Text style={{ color: fg, fontWeight: isCur ? "700" : "500", fontSize: 13 }}>
              {passed || wonPassed ? "✓ " : ""}
              {s.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function useOwnerOptions(includeAll = false): Option[] {
  const { profiles } = useRefData();
  const opts = profiles.filter((p) => p.active).map((p) => ({ value: p.id, label: p.full_name || p.email }));
  return includeAll ? [{ value: "", label: "All reps" }, ...opts] : opts;
}

export interface LeadFormValue {
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  equipment: string;
  amount: string;
  probability: string; // percent text, "" = stage default
  expected_close: string;
  quote_number: string;
  source: string;
  notes: string;
  lost_reason: string;
  stage_id: string;
  owner_id: string;
}

export function toFormValue(l: Partial<Lead>, defaults: { stage_id: number; owner_id: string }): LeadFormValue {
  return {
    company: l.company ?? "",
    contact_name: l.contact_name ?? "",
    email: l.email ?? "",
    phone: l.phone ?? "",
    equipment: l.equipment ?? "",
    amount: l.amount != null ? String(l.amount) : "",
    probability: l.probability != null ? String(Math.round(l.probability * 1000) / 10) : "",
    expected_close: l.expected_close ?? "",
    quote_number: l.quote_number ?? "",
    source: l.source ?? "",
    notes: l.notes ?? "",
    lost_reason: l.lost_reason ?? "",
    stage_id: String(l.stage_id ?? defaults.stage_id),
    owner_id: l.owner_id ?? defaults.owner_id,
  };
}

/** Validates the form and converts it to database fields. Returns an error message or the input. */
export function fromFormValue(v: LeadFormValue): string | (LeadInput & { company: string; stage_id: number }) {
  const company = v.company.trim();
  if (!company) return "Company is required.";
  const amount = v.amount.trim() === "" ? null : Number(v.amount.replace(/[$,\s]/g, ""));
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return "Price must be a positive number.";
  const probability = v.probability.trim() === "" ? null : Number(v.probability.replace("%", "")) / 100;
  if (probability != null && (!Number.isFinite(probability) || probability < 0 || probability > 1)) return "Probability must be between 0 and 100.";
  const email = v.email.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That email address doesn't look right.";
  const opt = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    company,
    contact_name: opt(v.contact_name),
    email: email || null,
    phone: opt(v.phone),
    equipment: opt(v.equipment),
    amount,
    probability,
    expected_close: opt(v.expected_close),
    quote_number: opt(v.quote_number),
    source: opt(v.source),
    notes: opt(v.notes),
    lost_reason: opt(v.lost_reason),
    stage_id: Number(v.stage_id),
    owner_id: v.owner_id,
  };
}

export function LeadForm({
  value,
  onChange,
  showStage = true,
}: {
  value: LeadFormValue;
  onChange: (v: LeadFormValue) => void;
  showStage?: boolean;
}) {
  const { stages, stagesById } = useRefData();
  const { isManager } = useAuth();
  const owners = useOwnerOptions();
  const set = (k: keyof LeadFormValue) => (val: string) => onChange({ ...value, [k]: val });
  const stage = stagesById.get(Number(value.stage_id));
  const lost = stage?.is_closed && !stage.is_won;
  return (
    <View style={{ gap: 14 }}>
      <Grid min={240} gap={14}>
        <Field label="Customer / Company *" value={value.company} onChangeText={set("company")} />
        <Field label="Contact name" value={value.contact_name} onChangeText={set("contact_name")} />
        <Field label="Email" value={value.email} onChangeText={set("email")} keyboardType="email-address" />
        <Field label="Phone" value={value.phone} onChangeText={set("phone")} keyboardType="phone-pad" />
        <Field label="Equipment" value={value.equipment} onChangeText={set("equipment")} />
        <Field label="Price ($)" value={value.amount} onChangeText={set("amount")} keyboardType="decimal-pad" />
        {showStage ? (
          <Select label="Stage" value={value.stage_id} onChange={set("stage_id")} options={stages.map((s) => ({ value: String(s.id), label: s.name }))} />
        ) : null}
        <Field
          label={`Probability % (default ${stage ? pct(stage.probability) : "—"})`}
          value={value.probability}
          onChangeText={set("probability")}
          placeholder="Use stage default"
          keyboardType="decimal-pad"
        />
        <DateField label="Expected close" value={value.expected_close} onChange={set("expected_close")} />
        <Field label="Quote #" value={value.quote_number} onChangeText={set("quote_number")} />
        <Field label="Lead source" value={value.source} onChangeText={set("source")} placeholder="Trade show, website, referral…" />
        {isManager ? <Select label="Owner" value={value.owner_id} onChange={set("owner_id")} options={owners} /> : null}
      </Grid>
      {lost ? <Field label="Lost reason" value={value.lost_reason} onChangeText={set("lost_reason")} /> : null}
      <Field label="Notes" value={value.notes} onChangeText={set("notes")} multiline />
    </View>
  );
}

/** Asks why a deal was lost before moving it to a lost stage. */
export function LostReasonModal({
  visible,
  company,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  company: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,27,45,0.45)", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 10, padding: 20, width: "100%", maxWidth: 420, gap: 12 }} role="dialog" aria-modal>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>Mark {company} as lost</Text>
          <ErrorBox message={error} />
          <Field label="Why was it lost?" value={reason} onChangeText={setReason} placeholder="Price, timing, went with competitor…" autoFocus />
          <Row style={{ justifyContent: "flex-end" }}>
            <Button
              label="Cancel"
              onPress={() => {
                setReason("");
                setError(null);
                onCancel();
              }}
            />
            <Button
              label="Mark lost"
              variant="danger"
              onPress={() => {
                if (!reason.trim()) return setError("Add a short reason; it feeds the win/loss report.");
                onConfirm(reason.trim());
                setReason("");
                setError(null);
              }}
            />
          </Row>
        </View>
      </View>
    </Modal>
  );
}
