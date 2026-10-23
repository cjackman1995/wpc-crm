import { useState } from "react";
import { Text, View } from "react-native";
import { Badge, Button, Card, Empty, ErrorBox, Field, Grid, Muted, Notice, Row, Screen, Select } from "@/components/ui";
import { getLeads, transferBook, updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData, useRefData } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { colors } from "@/theme";

export default function Team() {
  const { profile: me, isManager } = useAuth();
  const { profiles, stagesById, reload } = useRefData();
  const leads = useData(getLeads);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isManager) {
    return (
      <Screen title="Team">
        <Card>
          <Empty title="Managers only">Ask your sales manager to make changes to the team.</Empty>
        </Card>
      </Screen>
    );
  }

  const openCount = (id: string) => (leads.data ?? []).filter((l) => l.owner_id === id && !stagesById.get(l.stage_id)?.is_closed).length;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null);
    setInfo(null);
    try {
      await fn();
      setInfo(ok);
      await reload();
      leads.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen title="Team" subtitle="Roles decide visibility: reps see only their own leads and tasks; managers see everyone's.">
      <ErrorBox message={error} />
      {info ? <Notice tone="good">{info}</Notice> : null}
      <Card title="Adding people">
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text, lineHeight: 20 }}>
            In your Supabase dashboard, open Authentication → Users → Add user. Either invite them by email or create the user with a
            temporary password and tick “Auto Confirm User”. They appear here as a rep. Set their name below, and they can change their
            password under Settings.
          </Text>
          <Muted>New people always start as reps. Promote someone to manager here.</Muted>
        </View>
      </Card>
      <Grid min={320} gap={16}>
        {profiles.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            isMe={p.id === me?.id}
            openLeads={openCount(p.id)}
            others={profiles.filter((o) => o.id !== p.id && o.active)}
            act={act}
          />
        ))}
      </Grid>
    </Screen>
  );
}

function PersonCard({
  person,
  isMe,
  openLeads,
  others,
  act,
}: {
  person: Profile;
  isMe: boolean;
  openLeads: number;
  others: Profile[];
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [name, setName] = useState(person.full_name);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const label = person.full_name || person.email;
  return (
    <Card>
      <View style={{ gap: 12, opacity: person.active ? 1 : 0.65 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>{label}</Text>
            <Muted>{person.email}</Muted>
          </View>
          <Row>
            <Badge text={person.role === "manager" ? "Manager" : "Rep"} tone={person.role === "manager" ? "warn" : "primary"} />
            {!person.active ? <Badge text="Inactive" tone="bad" /> : null}
            {isMe ? <Badge text="You" /> : null}
          </Row>
        </Row>
        <Row>
          <Field value={name} onChangeText={setName} placeholder="Full name" style={{ flexGrow: 1 }} />
          <Button small label="Save name" onPress={() => act(() => updateProfile(person.id, { full_name: name.trim() }), `Saved ${name.trim()}.`)} disabled={name.trim() === person.full_name} />
        </Row>
        <Muted>{openLeads} open leads</Muted>
        {!isMe ? (
          <Row>
            <Button
              small
              label={person.role === "manager" ? "Make rep" : "Make manager"}
              onPress={() => act(() => updateProfile(person.id, { role: person.role === "manager" ? "rep" : "manager" }), `Updated ${label}'s role.`)}
            />
            <Button
              small
              variant={person.active ? "danger" : "secondary"}
              label={person.active ? "Deactivate" : "Reactivate"}
              onPress={() => act(() => updateProfile(person.id, { active: !person.active }), `${label} ${person.active ? "deactivated" : "reactivated"}.`)}
            />
          </Row>
        ) : null}
        {openLeads > 0 && others.length ? (
          <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
            <Muted>Move all of {label}'s leads and open tasks to:</Muted>
            <Row>
              <Select value={target} onChange={setTarget} options={others.map((o) => ({ value: o.id, label: o.full_name || o.email }))} style={{ flexGrow: 1 }} />
              <Button
                small
                label="Transfer"
                onPress={() => act(async () => transferBook(person.id, target), `Transferred ${label}'s leads.`)}
                disabled={!target}
              />
            </Row>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
