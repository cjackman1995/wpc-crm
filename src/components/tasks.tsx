import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { createTask, deleteTask, updateTask } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRefData } from "@/lib/data";
import { isoDate, shortDate } from "@/lib/format";
import type { Lead, Task } from "@/lib/types";
import { colors } from "@/theme";
import { useOwnerOptions } from "./leads";
import { Badge, Button, Checkbox, DateField, ErrorBox, Field, Row, Select } from "./ui";

export function dueTone(t: Task): { text: string; tone: "bad" | "warn" | "neutral" | "good" } {
  if (t.status === "done") return { text: `Done ${shortDate(t.completed_at)}`, tone: "good" };
  if (!t.due_date) return { text: "No due date", tone: "neutral" };
  const today = isoDate();
  if (t.due_date < today) return { text: `Overdue · ${shortDate(t.due_date)}`, tone: "bad" };
  if (t.due_date === today) return { text: "Due today", tone: "warn" };
  return { text: `Due ${shortDate(t.due_date)}`, tone: "neutral" };
}

export function TaskRow({
  task,
  lead,
  showOwner,
  onChanged,
}: {
  task: Task;
  lead?: Pick<Lead, "id" | "company"> | null;
  showOwner?: boolean;
  onChanged: () => void;
}) {
  const { profileName } = useRefData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = dueTone(task);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4, opacity: busy ? 0.5 : 1 }}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }} wrap={false}>
        <View style={{ flexShrink: 1, gap: 4 }}>
          <Checkbox
            label={task.title}
            checked={task.status === "done"}
            onChange={(v) => run(() => updateTask(task.id, { status: v ? "done" : "open" }))}
          />
          <Row style={{ paddingLeft: 26 }}>
            <Badge text={due.text} tone={due.tone} />
            {task.priority === "high" ? <Badge text="High priority" tone="warn" /> : null}
            {lead ? (
              <Link href={`/leads/${lead.id}`}>
                <Text style={{ color: colors.primaryDark, fontSize: 13 }}>{lead.company}</Text>
              </Link>
            ) : null}
            {showOwner ? <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{profileName(task.owner_id)}</Text> : null}
          </Row>
          {task.notes ? <Text style={{ color: colors.textSecondary, fontSize: 13, paddingLeft: 26 }}>{task.notes}</Text> : null}
        </View>
        <Pressable onPress={() => run(() => deleteTask(task.id))} aria-label={`Delete task ${task.title}`} style={{ padding: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Delete</Text>
        </Pressable>
      </Row>
      <ErrorBox message={error} />
    </View>
  );
}

export function NewTaskForm({
  leadId,
  leadOptions,
  defaultOwnerId,
  onCreated,
}: {
  leadId?: string;
  leadOptions?: Pick<Lead, "id" | "company">[];
  defaultOwnerId?: string;
  onCreated: () => void;
}) {
  const { profile, isManager } = useAuth();
  const owners = useOwnerOptions();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(isoDate());
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [owner, setOwner] = useState(defaultOwnerId ?? profile?.id ?? "");
  const [lead, setLead] = useState(leadId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return setError("Give the task a title.");
    setBusy(true);
    try {
      await createTask({
        title: title.trim(),
        due_date: due || null,
        priority,
        owner_id: owner || profile?.id,
        lead_id: lead || null,
      });
      setTitle("");
      setError(null);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <ErrorBox message={error} />
      <Field value={title} onChangeText={setTitle} placeholder="Follow-up call, send quote, schedule test…" onSubmit={save} />
      <Row gap={10}>
        <DateField value={due} onChange={setDue} style={{ width: 160 }} />
        <Select
          value={priority}
          onChange={(v) => setPriority(v as Task["priority"])}
          options={[
            { value: "normal", label: "Normal" },
            { value: "high", label: "High priority" },
            { value: "low", label: "Low" },
          ]}
          style={{ width: 140 }}
        />
        {leadOptions && !leadId ? (
          <Select
            value={lead}
            onChange={setLead}
            options={[{ value: "", label: "No related lead" }, ...leadOptions.map((l) => ({ value: l.id, label: l.company }))]}
            style={{ minWidth: 180, flexGrow: 1 }}
          />
        ) : null}
        {isManager ? <Select value={owner} onChange={setOwner} options={owners} style={{ minWidth: 150 }} /> : null}
        <Button label="Add task" variant="primary" onPress={save} busy={busy} />
      </Row>
    </View>
  );
}
