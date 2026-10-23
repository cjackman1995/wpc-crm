import { router } from "expo-router";
import { useState } from "react";
import { LeadForm, fromFormValue, toFormValue, type LeadFormValue } from "@/components/leads";
import { Button, Card, ErrorBox, Loading, Row, Screen } from "@/components/ui";
import { createLead } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRefData } from "@/lib/data";

export default function NewLead() {
  const { profile } = useAuth();
  const { stages, ready } = useRefData();
  const [value, setValue] = useState<LeadFormValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready || !profile) return <Loading />;
  const firstOpen = stages.find((s) => !s.is_closed) ?? stages[0];
  const form = value ?? toFormValue({}, { stage_id: firstOpen?.id ?? 0, owner_id: profile.id });

  const save = async () => {
    const input = fromFormValue(form);
    if (typeof input === "string") return setError(input);
    setBusy(true);
    setError(null);
    try {
      const lead = await createLead(input);
      router.replace(`/leads/${lead.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Screen title="New lead">
      <Card>
        <ErrorBox message={error} />
        <LeadForm value={form} onChange={setValue} />
        <Row style={{ marginTop: 16, justifyContent: "flex-end" }}>
          <Button label="Cancel" onPress={() => router.back()} />
          <Button label="Save lead" variant="primary" onPress={save} busy={busy} />
        </Row>
      </Card>
    </Screen>
  );
}
