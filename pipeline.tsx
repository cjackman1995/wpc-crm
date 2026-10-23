import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { LostReasonModal, useOwnerOptions } from "@/components/leads";
import { Badge, ErrorBox, Field, Loading, Row, Screen, Select } from "@/components/ui";
import { getLeads, updateLead } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData, useRefData } from "@/lib/data";
import { daysBetween, isoDate, moneyShort, shortDate } from "@/lib/format";
import { probabilityOf } from "@/lib/metrics";
import type { Lead, Stage } from "@/lib/types";
import { colors, radius } from "@/theme";

const CLOSED_WINDOW_DAYS = 90;

export default function Pipeline() {
  const { isManager } = useAuth();
  const { stages, stagesById, profileName } = useRefData();
  const owners = useOwnerOptions(true);
  const { data: leads, setData, error: loadError, loading } = useData(getLeads);
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<number | null>(null);
  const [losing, setLosing] = useState<{ lead: Lead; stage: Stage } | null>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const now = new Date();
    return (leads ?? []).filter((l) => {
      if (owner && l.owner_id !== owner) return false;
      if (needle && ![l.company, l.contact_name, l.equipment].some((v) => v?.toLowerCase().includes(needle))) return false;
      // closed columns only show recent closes so the board stays about current work
      if (l.closed_at && daysBetween(new Date(l.closed_at), now) > CLOSED_WINDOW_DAYS) return false;
      return true;
    });
  }, [leads, owner, q]);

  const move = async (lead: Lead, stage: Stage, lostReason?: string) => {
    if (lead.stage_id === stage.id) return;
    if (stage.is_closed && !stage.is_won && lostReason === undefined) {
      setLosing({ lead, stage });
      return;
    }
    const before = leads;
    // optimistic update so the card moves immediately
    setData((leads ?? []).map((l) => (l.id === lead.id ? { ...l, stage_id: stage.id, probability: null } : l)));
    try {
      const updated = await updateLead(lead.id, { stage_id: stage.id, ...(lostReason ? { lost_reason: lostReason } : {}) });
      setData((cur) => (cur ?? []).map((l) => (l.id === updated.id ? updated : l)));
      setError(null);
    } catch (e) {
      setData(before);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const neighbors = (s: Stage) => {
    const open = stages.filter((x) => !x.is_closed);
    const i = open.findIndex((x) => x.id === s.id);
    return { prev: i > 0 ? open[i - 1] : undefined, next: i >= 0 && i < open.length - 1 ? open[i + 1] : undefined };
  };

  if (loading && !leads) return <Loading />;

  return (
    <Screen
      title="Pipeline"
      subtitle={`Drag a card to another stage, or use the arrows. Closed columns show the last ${CLOSED_WINDOW_DAYS} days.`}
      actions={
        <Row>
          <Field value={q} onChangeText={setQ} placeholder="Filter cards…" style={{ width: 200 }} />
          {isManager ? <Select value={owner} onChange={setOwner} options={owners} style={{ width: 170 }} /> : null}
        </Row>
      }
    >
      <ErrorBox message={error || loadError} />
      <ScrollView horizontal contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
        {stages.map((s) => {
          const cards = visible.filter((l) => l.stage_id === s.id);
          const total = cards.reduce((sum, l) => sum + (l.amount ?? 0), 0);
          const weighted = cards.reduce((sum, l) => sum + (l.amount ?? 0) * probabilityOf(l, stagesById), 0);
          const accent = s.is_won ? colors.good : s.is_closed ? colors.bad : colors.primary;
          return (
            <div
              key={s.id}
              onDragOver={(e) => {
                e.preventDefault();
                if (overStage !== s.id) setOverStage(s.id);
              }}
              onDragLeave={() => setOverStage((o) => (o === s.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOverStage(null);
                const lead = visible.find((l) => l.id === (e.dataTransfer.getData("text/plain") || dragId));
                if (lead) move(lead, s);
              }}
              style={{ display: "flex", width: 260, flexShrink: 0 }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: overStage === s.id ? colors.primarySoft : "#e9edf2",
                  borderRadius: radius,
                  borderTopWidth: 3,
                  borderTopColor: accent,
                  padding: 8,
                  gap: 8,
                  minHeight: 420,
                }}
              >
                <View style={{ paddingHorizontal: 4, paddingVertical: 4, gap: 2 }}>
                  <Row style={{ justifyContent: "space-between" }} wrap={false}>
                    <Text style={{ fontWeight: "700", color: colors.text }} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Badge text={String(cards.length)} />
                  </Row>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                    {moneyShort(total)}
                    {!s.is_closed ? ` · ${moneyShort(weighted)} weighted` : ""}
                  </Text>
                </View>
                {cards.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", l.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(l.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    style={{ cursor: "grab", opacity: dragId === l.id ? 0.5 : 1 }}
                  >
                    <LeadCard
                      lead={l}
                      ownerName={isManager ? profileName(l.owner_id) : undefined}
                      prev={neighbors(s).prev}
                      next={neighbors(s).next}
                      onMove={(to) => move(l, to)}
                    />
                  </div>
                ))}
                {!cards.length ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", paddingVertical: 16 }}>Drop leads here</Text>
                ) : null}
              </View>
            </div>
          );
        })}
      </ScrollView>
      <LostReasonModal
        visible={!!losing}
        company={losing?.lead.company ?? ""}
        onCancel={() => setLosing(null)}
        onConfirm={(reason) => {
          const l = losing!;
          setLosing(null);
          move(l.lead, l.stage, reason);
        }}
      />
    </Screen>
  );
}

function LeadCard({
  lead,
  ownerName,
  prev,
  next,
  onMove,
}: {
  lead: Lead;
  ownerName?: string;
  prev?: Stage;
  next?: Stage;
  onMove: (s: Stage) => void;
}) {
  const overdue = lead.expected_close != null && lead.expected_close < isoDate() && !lead.closed_at;
  return (
    <Pressable
      onPress={() => router.push(`/leads/${lead.id}`)}
      style={({ hovered }: { hovered?: boolean; pressed: boolean }) => ({
        backgroundColor: "#fff",
        borderRadius: radius - 2,
        padding: 10,
        gap: 4,
        borderWidth: 1,
        borderColor: hovered ? colors.borderStrong : colors.border,
      })}
    >
      <Text style={{ fontWeight: "600", color: colors.text }} numberOfLines={2}>
        {lead.company}
      </Text>
      {lead.equipment ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
          {lead.equipment}
        </Text>
      ) : null}
      <Row style={{ justifyContent: "space-between" }} wrap={false}>
        <Text style={{ fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{lead.amount != null ? moneyShort(lead.amount) : "—"}</Text>
        {lead.expected_close ? (
          <Text style={{ fontSize: 12, color: overdue ? colors.bad : colors.textSecondary }}>{shortDate(lead.expected_close)}</Text>
        ) : null}
      </Row>
      <Row style={{ justifyContent: "space-between" }} wrap={false}>
        <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
          {ownerName ?? ""}
        </Text>
        <Row gap={2} wrap={false}>
          {prev ? <Arrow label="◀" title={`Move back to ${prev.name}`} onPress={() => onMove(prev)} /> : null}
          {next ? <Arrow label="▶" title={`Move to ${next.name}`} onPress={() => onMove(next)} /> : null}
        </Row>
      </Row>
    </Pressable>
  );
}

function Arrow({ label, title, onPress }: { label: string; title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      aria-label={title}
      style={({ hovered }: { hovered?: boolean; pressed: boolean }) => ({
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: hovered ? colors.primarySoft : "transparent",
      })}
    >
      <Text style={{ color: colors.primaryDark, fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}
