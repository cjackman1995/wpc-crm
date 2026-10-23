import { router, useLocalSearchParams } from "expo-router";
import { useState, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { LeadForm, LostReasonModal, StageBadge, StagePath, fromFormValue, toFormValue, type LeadFormValue } from "@/components/leads";
import { NewTaskForm, TaskRow } from "@/components/tasks";
import { Badge, Button, Card, Empty, ErrorBox, Field, Grid, Label, Loading, Row, Screen, Segmented } from "@/components/ui";
import { addActivity, deleteActivity, deleteLead, getActivities, getLead, getTasks, updateLead } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData, useRefData } from "@/lib/data";
import { dateTime, daysBetween, money, pct, shortDate } from "@/lib/format";
import { probabilityOf } from "@/lib/metrics";
import type { Activity, ActivityType, Lead, Stage } from "@/lib/types";
import { colors } from "@/theme";

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, isManager } = useAuth();
  const { stages, stagesById, profileName } = useRefData();
  const lead = useData(() => getLead(id), [id]);
  const tasks = useData(() => getTasks({ leadId: id }), [id]);
  const activity = useData(() => getActivities(id), [id]);
  const [editing, setEditing] = useState<LeadFormValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [losing, setLosing] = useState<Stage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false); // two-step delete, no browser confirm() dialog

  if (lead.loading && !lead.data) return <Loading />;
  const l = lead.data;
  if (!l) {
    return (
      <Screen title="Lead not found">
        <ErrorBox message={lead.error} />
        <Card>
          <Empty title="This lead doesn't exist or isn't yours.">Leads are visible to their owner and to managers.</Empty>
        </Card>
      </Screen>
    );
  }
  const stage = stagesById.get(l.stage_id);

  const save = async (patch: Partial<Lead>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateLead(l.id, patch);
      lead.setData(updated);
      activity.reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickStage = (s: Stage) => {
    if (s.is_closed && !s.is_won) setLosing(s);
    else save({ stage_id: s.id });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const input = fromFormValue(editing);
    if (typeof input === "string") return setError(input);
    if (await save(input)) setEditing(null);
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deleteLead(l.id);
      router.replace("/leads");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const prob = probabilityOf(l, stagesById);
  const daysInStage = Math.floor(daysBetween(new Date(l.stage_entered_at), new Date()));

  return (
    <Screen
      title={l.company}
      subtitle={[l.contact_name, l.equipment].filter(Boolean).join(" · ") || undefined}
      actions={
        editing ? (
          <>
            <Button label="Cancel" onPress={() => setEditing(null)} />
            <Button label="Save changes" variant="primary" onPress={saveEdit} busy={busy} />
          </>
        ) : (
          <>
            {isManager ? <Button label={confirmDelete ? "Click again to delete" : "Delete"} variant="danger" onPress={remove} /> : null}
            <Button label="Edit" variant="primary" onPress={() => setEditing(toFormValue(l, { stage_id: l.stage_id, owner_id: l.owner_id }))} />
          </>
        )
      }
    >
      <ErrorBox message={error} />
      <Card>
        <View style={{ gap: 12 }}>
          <StagePath stages={stages} current={l.stage_id} onPick={pickStage} disabled={busy || !!editing} />
          <Row gap={20}>
            <Stat label="Price" value={money(l.amount)} />
            <Stat label="Probability" value={`${pct(prob)}${l.probability != null ? " (manual)" : ""}`} />
            <Stat label="Weighted" value={money((l.amount ?? 0) * prob)} />
            <Stat label="Expected close" value={shortDate(l.expected_close)} />
            <Stat label={stage?.is_closed ? "Closed" : "In stage"} value={stage?.is_closed ? shortDate(l.closed_at) : `${daysInStage} days`} />
            <Stat label="Owner" value={profileName(l.owner_id)} />
          </Row>
        </View>
      </Card>

      <Grid min={360} gap={20}>
        <View style={{ gap: 20 }}>
          <Card title="Details">
            {editing ? (
              <LeadForm value={editing} onChange={setEditing} />
            ) : (
              <View style={{ gap: 12 }}>
                <Grid min={200} gap={12}>
                  <Detail label="Contact" value={l.contact_name} />
                  <Detail label="Email" value={l.email} link={l.email ? `mailto:${l.email}` : undefined} />
                  <Detail label="Phone" value={l.phone} link={l.phone ? `tel:${l.phone}` : undefined} />
                  <Detail label="Equipment" value={l.equipment} />
                  <Detail label="Quote #" value={l.quote_number} />
                  <Detail label="Lead source" value={l.source} />
                  <Detail label="Stage" value={<StageBadge stage={stage} />} />
                  <Detail label="Created" value={shortDate(l.created_at)} />
                </Grid>
                {l.lost_reason ? <Detail label="Lost reason" value={l.lost_reason} /> : null}
                <Detail label="Notes" value={l.notes} />
              </View>
            )}
          </Card>
          <Card title="Tasks">
            {profile ? <NewTaskForm leadId={l.id} defaultOwnerId={l.owner_id} onCreated={tasks.reload} /> : null}
            <View style={{ marginTop: 8 }}>
              {(tasks.data ?? []).map((t) => (
                <TaskRow key={t.id} task={t} showOwner={isManager} onChanged={tasks.reload} />
              ))}
              {tasks.data && !tasks.data.length ? <Empty title="No tasks on this lead" /> : null}
            </View>
          </Card>
        </View>
        <ActivityCard leadId={l.id} items={activity.data ?? []} reload={activity.reload} />
      </Grid>

      <LostReasonModal
        visible={!!losing}
        company={l.company}
        onCancel={() => setLosing(null)}
        onConfirm={async (reason) => {
          const s = losing!;
          setLosing(null);
          await save({ stage_id: s.id, lost_reason: reason });
        }}
      />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2, minWidth: 110 }}>
      <Label>{label}</Label>
      <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function Detail({ label, value, link }: { label: string; value: ReactNode; link?: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Label>{label}</Label>
      {typeof value === "string" || value == null ? (
        link ? (
          <Text role="link" onPress={() => Linking.openURL(link)} style={{ color: colors.primaryDark }}>
            {value}
          </Text>
        ) : (
          <Text style={{ color: value ? colors.text : colors.textMuted }}>{value || "—"}</Text>
        )
      ) : (
        value
      )}
    </View>
  );
}

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
];

function ActivityCard({ leadId, items, reload }: { leadId: string; items: Activity[]; reload: () => void }) {
  const { profile, isManager } = useAuth();
  const { profileName } = useRefData();
  const [type, setType] = useState<ActivityType>("note");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!body.trim() || !profile) return;
    setBusy(true);
    try {
      await addActivity(leadId, profile.id, type, body.trim());
      setBody("");
      setError(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Activity">
      <View style={{ gap: 10 }}>
        <ErrorBox message={error} />
        <Segmented value={type} onChange={setType} options={ACTIVITY_TYPES} />
        <Field value={body} onChangeText={setBody} multiline placeholder={type === "call" ? "Who you spoke with and what was agreed…" : "What happened?"} />
        <Row style={{ justifyContent: "flex-end" }}>
          <Button label={`Log ${ACTIVITY_TYPES.find((a) => a.value === type)?.label.toLowerCase()}`} variant="primary" onPress={add} busy={busy} disabled={!body.trim()} />
        </Row>
        <View style={{ marginTop: 6 }}>
          {items.map((a) => {
            const canDelete = isManager || (a.user_id === profile?.id && !["stage_change", "system"].includes(a.type));
            return (
              <View key={a.id} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Row>
                    <Badge text={a.type === "stage_change" ? "Stage" : a.type === "system" ? "Update" : a.type[0].toUpperCase() + a.type.slice(1)} tone={a.type === "stage_change" ? "primary" : "neutral"} />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {profileName(a.user_id)} · {dateTime(a.created_at)}
                    </Text>
                  </Row>
                  {canDelete ? (
                    <Pressable onPress={() => deleteActivity(a.id).then(reload).catch((e) => setError(String(e.message ?? e)))}>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Delete</Text>
                    </Pressable>
                  ) : null}
                </Row>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{a.body}</Text>
              </View>
            );
          })}
          {!items.length ? <Empty title="No activity yet">Calls, emails and stage changes show up here.</Empty> : null}
        </View>
      </View>
    </Card>
  );
}
