import { Link, router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { ColumnChart, HBarChart } from "@/components/charts";
import { useOwnerOptions } from "@/components/leads";
import { TaskRow } from "@/components/tasks";
import { Badge, Card, DataTable, Empty, ErrorBox, Grid, Kpi, Loading, Muted, Row, Screen, Select } from "@/components/ui";
import { getLeads, getTasks } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useData, useRefData } from "@/lib/data";
import { isoDate, money, moneyShort, monthLabel, pct } from "@/lib/format";
import { RANGE_LABELS, byStage, leaderboard, presetRange, projection, staleLeads, summary, type RangePreset, type RepRow } from "@/lib/metrics";
import { colors } from "@/theme";

export default function Dashboard() {
  const { profile, isManager } = useAuth();
  const { stages, stagesById, profiles } = useRefData();
  const owners = useOwnerOptions(true);
  const leads = useData(getLeads);
  const tasks = useData(() => getTasks());
  const [owner, setOwner] = useState("");
  const [preset, setPreset] = useState<RangePreset>("year");

  const today = useMemo(() => new Date(), []);
  const range = presetRange(preset, today);
  const scoped = useMemo(() => (leads.data ?? []).filter((l) => !owner || l.owner_id === owner), [leads.data, owner]);

  if ((leads.loading && !leads.data) || !stages.length) return <Loading />;

  const s = summary(scoped, stagesById, range);
  const stageRows = byStage(scoped, stages).filter((r) => !r.stage.is_closed);
  const proj = projection(scoped, stagesById, today, 12);
  const stale = staleLeads(scoped, stagesById, today).slice(0, 8);
  const companyView = isManager && !owner;
  const reps = companyView ? leaderboard(scoped, stagesById, profiles, tasks.data ?? [], today, range) : [];

  const todayIso = isoDate(today);
  const myTasks = (tasks.data ?? [])
    .filter((t) => t.owner_id === profile?.id && t.status === "open" && t.due_date != null && t.due_date <= todayIso)
    .slice(0, 8);
  const leadName = new Map((leads.data ?? []).map((l) => [l.id, l]));

  const title = companyView ? "Company dashboard" : isManager ? `${owners.find((o) => o.value === owner)?.label}'s dashboard` : "My dashboard";

  return (
    <Screen
      title={title}
      subtitle={companyView ? "All reps combined" : undefined}
      actions={
        <Row>
          {isManager ? <Select value={owner} onChange={setOwner} options={owners.map((o) => (o.value === "" ? { value: "", label: "Whole company" } : o))} style={{ width: 190 }} /> : null}
          <Select
            value={preset}
            onChange={(v) => setPreset(v as RangePreset)}
            options={(Object.keys(RANGE_LABELS) as RangePreset[]).map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
            style={{ width: 160 }}
          />
        </Row>
      }
    >
      <ErrorBox message={leads.error || tasks.error} />
      <Grid min={180} gap={12}>
        <Kpi label="Open pipeline" value={moneyShort(s.openValue)} sub={`${s.openCount} open deals`} />
        <Kpi label="Weighted forecast" value={moneyShort(s.weightedValue)} sub="Price × probability" />
        <Kpi label="Closed won" value={moneyShort(s.wonValue)} sub={`${s.wonCount} deal${s.wonCount === 1 ? "" : "s"} · ${RANGE_LABELS[preset].toLowerCase()}`} />
        <Kpi label="Win rate" value={pct(s.winRate)} sub={`${s.wonCount} won / ${s.lostCount} lost`} />
        <Kpi label="Avg open deal" value={moneyShort(s.avgOpenDeal)} />
      </Grid>

      <Grid min={380} gap={16}>
        <Card title="Open pipeline by stage">
          <HBarChart
            ariaLabel="Open pipeline value by stage"
            data={stageRows.map((r) => ({
              label: r.stage.name,
              value: r.value,
              display: moneyShort(r.value),
              secondary: `${r.count} deal${r.count === 1 ? "" : "s"}`,
            }))}
          />
        </Card>
        <Card title="Revenue projection by expected close">
          <ColumnChart
            ariaLabel="Open pipeline by expected close month, weighted and total"
            legend={{ part: "Weighted", total: "Total if all close" }}
            format={moneyShort}
            data={proj.months.map((m) => ({
              label: monthLabel(m.key),
              total: m.total,
              part: m.weighted,
              tooltip: [`Weighted ${money(m.weighted)}`, `Total ${money(m.total)}`, `${m.count} deals`],
            }))}
          />
          <View style={{ marginTop: 12, gap: 4 }}>
            {proj.pastDue.count ? (
              <Text style={{ color: colors.bad, fontSize: 13 }}>
                {proj.pastDue.count} open deals ({money(proj.pastDue.total)}) have an expected close date in the past.
              </Text>
            ) : null}
            {proj.noDate.count ? (
              <Muted>
                {proj.noDate.count} open deals ({money(proj.noDate.total)}) have no expected close date.
              </Muted>
            ) : null}
          </View>
        </Card>
      </Grid>

      {companyView ? (
        <Card title="Rep leaderboard" padded={false}>
          <DataTable<RepRow>
            rows={reps}
            rowKey={(r) => r.profile.id}
            onRowPress={(r) => setOwner(r.profile.id)}
            empty="No reps yet. Add your team on the Team page."
            columns={[
              { key: "rep", label: "Rep", width: 160, flex: 2, render: (r) => r.profile.full_name || r.profile.email, sortValue: (r) => r.profile.full_name },
              { key: "open", label: "Open deals", width: 100, align: "right", render: (r) => r.openCount, sortValue: (r) => r.openCount },
              { key: "pipe", label: "Pipeline", width: 120, align: "right", render: (r) => moneyShort(r.openValue), sortValue: (r) => r.openValue },
              { key: "w", label: "Weighted", width: 120, align: "right", render: (r) => moneyShort(r.weighted), sortValue: (r) => r.weighted },
              { key: "won", label: "Won", width: 120, align: "right", render: (r) => moneyShort(r.wonValue), sortValue: (r) => r.wonValue },
              { key: "wr", label: "Win rate", width: 90, align: "right", render: (r) => pct(r.winRate), sortValue: (r) => r.winRate },
              {
                key: "tasks",
                label: "Overdue tasks",
                width: 120,
                align: "right",
                render: (r) => (r.overdueTasks ? <Badge text={String(r.overdueTasks)} tone="bad" /> : "0"),
                sortValue: (r) => r.overdueTasks,
              },
            ]}
          />
        </Card>
      ) : null}

      <Grid min={380} gap={16}>
        <Card title="My tasks due" right={<Link href="/tasks"><Text style={{ color: colors.primaryDark }}>All tasks</Text></Link>}>
          {myTasks.map((t) => (
            <TaskRow key={t.id} task={t} lead={t.lead_id ? leadName.get(t.lead_id) : null} onChanged={tasks.reload} />
          ))}
          {!myTasks.length ? <Empty title="Nothing due today">Overdue and today's tasks show up here.</Empty> : null}
        </Card>
        <Card title="Needs attention" padded={false}>
          <DataTable
            rows={stale}
            rowKey={(r) => r.lead.id}
            onRowPress={(r) => router.push(`/leads/${r.lead.id}`)}
            empty="No stale or past-due deals."
            columns={[
              { key: "c", label: "Lead", width: 160, flex: 2, render: (r) => r.lead.company },
              { key: "s", label: "Stage", width: 130, render: (r) => stagesById.get(r.lead.stage_id)?.name ?? "—" },
              {
                key: "why",
                label: "Why",
                width: 150,
                render: (r) => <Badge text={r.pastDue ? "Past close date" : `${r.daysInStage} days in stage`} tone={r.pastDue ? "bad" : "warn"} />,
              },
            ]}
          />
        </Card>
      </Grid>
    </Screen>
  );
}
