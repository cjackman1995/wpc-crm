import { useMemo, useState } from "react";
import { View } from "react-native";
import { useOwnerOptions } from "@/components/leads";
import { NewTaskForm, TaskRow } from "@/components/tasks";
import { Card, Empty, ErrorBox, Loading, Row, Screen, Segmented, Select } from "@/components/ui";
import { getLeads, getTasks } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data";
import { isoDate } from "@/lib/format";
import type { Task } from "@/lib/types";

type View_ = "open" | "done";

export default function Tasks() {
  const { profile, isManager } = useAuth();
  const owners = useOwnerOptions(true);
  const tasks = useData(() => getTasks());
  const leads = useData(getLeads);
  const [view, setView] = useState<View_>("open");
  // managers default to their own list but can look at anyone's
  const [owner, setOwner] = useState<string>(profile?.id ?? "");

  const leadById = useMemo(() => new Map((leads.data ?? []).map((l) => [l.id, l])), [leads.data]);
  const today = isoDate();
  const mine = (tasks.data ?? []).filter((t) => !owner || t.owner_id === owner);

  const groups: { title: string; items: Task[] }[] =
    view === "open"
      ? [
          { title: "Overdue", items: mine.filter((t) => t.status === "open" && t.due_date != null && t.due_date < today) },
          { title: "Today", items: mine.filter((t) => t.status === "open" && t.due_date === today) },
          { title: "Upcoming", items: mine.filter((t) => t.status === "open" && t.due_date != null && t.due_date > today) },
          { title: "No due date", items: mine.filter((t) => t.status === "open" && t.due_date == null) },
        ]
      : [
          {
            title: "Completed",
            items: mine
              .filter((t) => t.status === "done")
              .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
              .slice(0, 200),
          },
        ];

  const openCount = mine.filter((t) => t.status === "open").length;

  return (
    <Screen title="Tasks" subtitle={`${openCount} open`}>
      <ErrorBox message={tasks.error} />
      <Card title="New task">
        <NewTaskForm leadOptions={(leads.data ?? []).filter((l) => !l.closed_at)} onCreated={tasks.reload} />
      </Card>
      <Row gap={12}>
        <Segmented<View_>
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Completed" },
          ]}
        />
        {isManager ? (
          <Select
            value={owner}
            onChange={setOwner}
            options={owners.map((o) => (o.value === "" ? { value: "", label: "Everyone" } : o))}
            style={{ width: 200 }}
          />
        ) : null}
      </Row>
      {tasks.loading && !tasks.data ? (
        <Loading />
      ) : (
        <View style={{ gap: 16 }}>
          {groups.map((g) =>
            g.items.length ? (
              <Card key={g.title} title={`${g.title} (${g.items.length})`}>
                {g.items.map((t) => (
                  <TaskRow key={t.id} task={t} lead={t.lead_id ? leadById.get(t.lead_id) : null} showOwner={isManager && !owner} onChanged={tasks.reload} />
                ))}
              </Card>
            ) : null
          )}
          {groups.every((g) => !g.items.length) ? (
            <Card>
              <Empty title={view === "open" ? "You're all caught up" : "Nothing completed yet"} />
            </Card>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
