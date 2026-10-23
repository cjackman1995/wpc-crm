import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Checkbox, ErrorBox, Field, Grid, Muted, Notice, Row, Screen } from "@/components/ui";
import { changePassword, deleteStage, saveStage, updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRefData } from "@/lib/data";
import type { Stage } from "@/lib/types";
import { colors } from "@/theme";

export default function Settings() {
  const { profile, isManager, refreshProfile } = useAuth();
  const { reload } = useRefData();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setError(null);
    setInfo(null);
    try {
      await fn();
      setInfo(ok);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen title="Settings">
      <ErrorBox message={error} />
      {info ? <Notice tone="good">{info}</Notice> : null}
      <Grid min={320} gap={16}>
        <Card title="Your profile">
          <View style={{ gap: 12 }}>
            <Field label="Name" value={name} onChangeText={setName} />
            <Muted>{profile?.email}</Muted>
            <Row>
              <Button
                label="Save"
                variant="primary"
                onPress={() =>
                  run(async () => {
                    await updateProfile(profile!.id, { full_name: name.trim() });
                    await refreshProfile();
                    await reload();
                  }, "Name saved.")
                }
              />
            </Row>
          </View>
        </Card>
        <Card title="Change password">
          <View style={{ gap: 12 }}>
            <Field label="New password" value={pw} onChangeText={setPw} secure />
            <Field label="Confirm" value={pw2} onChangeText={setPw2} secure />
            <Row>
              <Button
                label="Update password"
                variant="primary"
                onPress={() =>
                  run(async () => {
                    if (pw.length < 8) throw new Error("Use at least 8 characters.");
                    if (pw !== pw2) throw new Error("The passwords don't match.");
                    await changePassword(pw);
                    setPw("");
                    setPw2("");
                  }, "Password updated.")
                }
              />
            </Row>
          </View>
        </Card>
      </Grid>
      {isManager ? <StagesEditor onError={setError} onInfo={setInfo} /> : null}
    </Screen>
  );
}

function StagesEditor({ onError, onInfo }: { onError: (e: string | null) => void; onInfo: (s: string | null) => void }) {
  const { stages, reload } = useRefData();
  const [adding, setAdding] = useState(false);
  return (
    <Card title="Pipeline stages" right={<Button small label="Add stage" onPress={() => setAdding(true)} />}>
      <View style={{ gap: 4 }}>
        <Muted>
          Probability is the default chance of winning at each stage; it drives the weighted forecast. Order sets the left-to-right
          order on the pipeline board. A stage that still has leads can't be deleted.
        </Muted>
        {stages.map((s) => (
          <StageRow key={s.id} stage={s} onSaved={reload} onError={onError} onInfo={onInfo} />
        ))}
        {adding ? (
          <StageRow
            stage={{ id: 0, name: "", sort_order: (stages.at(-1)?.sort_order ?? 0) + 1, probability: 0.1, is_closed: false, is_won: false }}
            onSaved={async () => {
              setAdding(false);
              await reload();
            }}
            onError={onError}
            onInfo={onInfo}
          />
        ) : null}
      </View>
    </Card>
  );
}

function StageRow({
  stage,
  onSaved,
  onError,
  onInfo,
}: {
  stage: Stage;
  onSaved: () => Promise<void> | void;
  onError: (e: string | null) => void;
  onInfo: (s: string | null) => void;
}) {
  const [name, setName] = useState(stage.name);
  const [order, setOrder] = useState(String(stage.sort_order));
  const [prob, setProb] = useState(String(Math.round(stage.probability * 100)));
  const [closed, setClosed] = useState(stage.is_closed);
  const [won, setWon] = useState(stage.is_won);

  const save = async () => {
    onError(null);
    const p = Number(prob) / 100;
    if (!name.trim()) return onError("Stage name is required.");
    if (!Number.isFinite(p) || p < 0 || p > 1) return onError("Probability must be 0–100.");
    try {
      await saveStage({ id: stage.id || undefined, name: name.trim(), sort_order: Number(order) || 0, probability: p, is_closed: closed || won, is_won: won });
      onInfo(`Saved stage ${name.trim()}.`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Row gap={10} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Field value={order} onChangeText={setOrder} style={{ width: 56 }} keyboardType="numeric" />
      <Field value={name} onChangeText={setName} placeholder="Stage name" style={{ flexGrow: 1, minWidth: 160 }} />
      <Row gap={4}>
        <Field value={prob} onChangeText={setProb} style={{ width: 64 }} keyboardType="numeric" />
        <Text style={{ color: colors.textSecondary }}>%</Text>
      </Row>
      <Checkbox label="Closed" checked={closed || won} onChange={setClosed} />
      <Checkbox label="Won" checked={won} onChange={setWon} />
      <Button small label={stage.id ? "Save" : "Add"} variant="primary" onPress={save} />
      {stage.id ? (
        <Button
          small
          label="Delete"
          variant="danger"
          onPress={async () => {
            try {
              await deleteStage(stage.id);
              onInfo(`Deleted ${stage.name}.`);
              await onSaved();
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              onError(msg.includes("foreign key") ? `${stage.name} still has leads or history. Move them first.` : msg);
            }
          }}
        />
      ) : null}
    </Row>
  );
}
