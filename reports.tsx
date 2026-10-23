import { router } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { ColumnChart } from "@/components/charts";
import { useOwnerOptions } from "@/components/leads";
import { Button, Card, DataTable, ErrorBox, Loading, Row, Screen, Select, type Column } from "@/components/ui";
import { getLeads, getStageChanges, getTasks } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { downloadText, toCsv } from "@/lib/csv";
import { useData, useRefData } from "@/lib/data";
import { isoDate, money, moneyShort, monthLabel, pct } from "@/lib/format";
import {
  RANGE_LABELS,
  bySource,
  byStage,
  closedByMonth,
  funnel,
  isLost,
  leaderboard,
  presetRange,
  staleLeads,
  timeInStage,
  type RangePreset,
} from "@/lib/metrics";

/** A report card: a table plus an "Export CSV" of exactly what's shown. */
function Report<T>({
  title,
  rows,
  columns,
  csv,
  chart,
  onRowPress,
  rowKey,
}: {
  title: string;
  rows: T[];
  columns: Column<T>[];
  csv: { header: string[]; row: (r: T) => (string | number | null | undefined)[] };
  chart?: ReactNode;
  onRowPress?: (r: T) => void;
  rowKey: (r: T) => string;
}) {
  return (
    <Card
      title={title}
      padded={false}
      right={
        <Button
          small
          label="Export CSV"
          onPress={() => downloadText(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${isoDate()}.csv`, toCsv(csv.header, rows.map(csv.row)))}
        />
      }
    >
      {chart ? <View style={{ padding: 16 }}>{chart}</View> : null}
      <DataTable rows={rows} columns={columns} rowKey={rowKey} onRowPress={onRowPress} />
    </Card>
  );
}

export default function Reports() {
  const { isManager } = useAuth();
  const { stages, stagesById, profiles, profileName } = useRefData();
  const owners = useOwnerOptions(true);
  const leads = useData(getLeads);
  const changes = useData(getStageChanges);
  const tasks = useData(() => getTasks());
  const [owner, setOwner] = useState("");
  const [preset, setPreset] = useState<RangePreset>("year");
  const today = useMemo(() => new Date(), []);

  const scoped = useMemo(() => (leads.data ?? []).filter((l) => !owner || l.owner_id === owner), [leads.data, owner]);
  if ((leads.loading && !leads.data) || !stages.length) return <Loading />;

  const range = presetRange(preset, today);
  const inRange = (iso: string | null) =>
    !!iso && (!range || ((!range.from || new Date(iso) >= range.from) && (!range.to || new Date(iso) < range.to)));
  // History-based reports cover leads created in the period.
  const cohort = scoped.filter((l) => inRange(l.created_at));
  const allChanges = changes.data ?? [];

  const stageRows = byStage(scoped, stages);
  const funnelRows = funnel(cohort, stages, allChanges);
  const timeRows = timeInStage(scoped, stages, allChanges, today);
  const monthRows = closedByMonth(scoped, stagesById, today, 12);
  const sourceRows = bySource(cohort, stagesById);
  const stale = staleLeads(scoped, stagesById, today);
  const reps = leaderboard(scoped, stagesById, profiles, tasks.data ?? [], today, range);
  const lostReasons = Object.entries(
    scoped
      .filter((l) => isLost(l, stagesById) && inRange(l.closed_at))
      .reduce<Record<string, { count: number; value: number }>>((acc, l) => {
        const k = l.lost_reason?.trim() || "(no reason given)";
        acc[k] = acc[k] ?? { count: 0, value: 0 };
        acc[k].count++;
        acc[k].value += l.amount ?? 0;
        return acc;
      }, {})
  )
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.count - a.count);

  return (
    <Screen
      title="Reports"
      subtitle={`${isManager && !owner ? "Whole company" : owner ? profileName(owner) : "Your pipeline"} · ${RANGE_LABELS[preset]}`}
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
      <ErrorBox message={leads.error || changes.error} />

      <Report
        title="Pipeline by stage"
        rows={stageRows}
        rowKey={(r) => String(r.stage.id)}
        columns={[
          { key: "s", label: "Stage", width: 180, flex: 2, render: (r) => r.stage.name },
          { key: "p", label: "Default prob.", width: 110, align: "right", render: (r) => pct(r.stage.probability) },
          { key: "c", label: "Deals", width: 80, align: "right", render: (r) => r.count },
          { key: "v", label: "Total value", width: 140, align: "right", render: (r) => money(r.value) },
          { key: "w", label: "Weighted", width: 140, align: "right", render: (r) => money(r.weighted) },
        ]}
        csv={{ header: ["Stage", "Deal Count", "Total Value ($)", "Weighted Value ($)"], row: (r) => [r.stage.name, r.count, r.value, Math.round(r.weighted * 100) / 100] }}
      />

      <Report
        title="Won and lost by month"
        rows={monthRows}
        rowKey={(r) => r.key}
        chart={
          <ColumnChart
            ariaLabel="Closed won value by month"
            format={moneyShort}
            data={monthRows.map((m) => ({
              label: monthLabel(m.key),
              total: m.wonValue,
              tooltip: [`Won ${money(m.wonValue)}`, `${m.wonCount} won · ${m.lostCount} lost`],
            }))}
          />
        }
        columns={[
          { key: "m", label: "Month", width: 120, flex: 1, render: (r) => monthLabel(r.key) },
          { key: "wc", label: "Won", width: 80, align: "right", render: (r) => r.wonCount },
          { key: "wv", label: "Won value", width: 140, align: "right", render: (r) => money(r.wonValue) },
          { key: "lc", label: "Lost", width: 80, align: "right", render: (r) => r.lostCount },
          { key: "wr", label: "Win rate", width: 100, align: "right", render: (r) => pct(r.wonCount + r.lostCount ? r.wonCount / (r.wonCount + r.lostCount) : null) },
        ]}
        csv={{ header: ["Month", "Won", "Won Value ($)", "Lost"], row: (r) => [r.key, r.wonCount, r.wonValue, r.lostCount] }}
      />

      {isManager && !owner ? (
        <Report
          title="Rep performance"
          rows={reps}
          rowKey={(r) => r.profile.id}
          onRowPress={(r) => setOwner(r.profile.id)}
          columns={[
            { key: "r", label: "Rep", width: 160, flex: 2, render: (r) => r.profile.full_name || r.profile.email },
            { key: "o", label: "Open", width: 70, align: "right", render: (r) => r.openCount },
            { key: "ov", label: "Pipeline", width: 120, align: "right", render: (r) => money(r.openValue) },
            { key: "w", label: "Weighted", width: 120, align: "right", render: (r) => money(r.weighted) },
            { key: "wc", label: "Won", width: 70, align: "right", render: (r) => r.wonCount },
            { key: "wv", label: "Won value", width: 120, align: "right", render: (r) => money(r.wonValue) },
            { key: "lc", label: "Lost", width: 70, align: "right", render: (r) => r.lostCount },
            { key: "wr", label: "Win rate", width: 90, align: "right", render: (r) => pct(r.winRate) },
            { key: "t", label: "Open / overdue tasks", width: 150, align: "right", render: (r) => `${r.openTasks} / ${r.overdueTasks}` },
          ]}
          csv={{
            header: ["Rep", "Open Deals", "Pipeline ($)", "Weighted ($)", "Won", "Won Value ($)", "Lost", "Win Rate", "Open Tasks", "Overdue Tasks"],
            row: (r) => [r.profile.full_name, r.openCount, r.openValue, Math.round(r.weighted), r.wonCount, r.wonValue, r.lostCount, r.winRate ?? "", r.openTasks, r.overdueTasks],
          }}
        />
      ) : null}

      <Report
        title="Stage conversion"
        rows={funnelRows}
        rowKey={(r) => String(r.stage.id)}
        columns={[
          { key: "s", label: "Stage", width: 180, flex: 2, render: (r) => r.stage.name },
          { key: "r", label: "Leads that reached it", width: 170, align: "right", render: (r) => r.reached },
          { key: "c", label: "Moved on to next stage", width: 180, align: "right", render: (r) => pct(r.conversionToNext) },
        ]}
        csv={{ header: ["Stage", "Reached", "Conversion To Next"], row: (r) => [r.stage.name, r.reached, r.conversionToNext ?? ""] }}
      />

      <Report
        title="Time in stage"
        rows={timeRows}
        rowKey={(r) => String(r.stage.id)}
        columns={[
          { key: "s", label: "Stage", width: 180, flex: 2, render: (r) => r.stage.name },
          { key: "a", label: "Avg days (finished)", width: 160, align: "right", render: (r) => (r.avgDaysCompleted == null ? "—" : r.avgDaysCompleted.toFixed(1)) },
          { key: "n", label: "Finished stays", width: 120, align: "right", render: (r) => r.completedStays },
          { key: "c", label: "Sitting there now", width: 140, align: "right", render: (r) => r.currentCount },
          { key: "ca", label: "Avg age now (days)", width: 150, align: "right", render: (r) => (r.avgDaysCurrent == null ? "—" : r.avgDaysCurrent.toFixed(0)) },
        ]}
        csv={{
          header: ["Stage", "Avg Days Finished", "Finished Stays", "Current Count", "Avg Days Current"],
          row: (r) => [r.stage.name, r.avgDaysCompleted?.toFixed(1), r.completedStays, r.currentCount, r.avgDaysCurrent?.toFixed(0)],
        }}
      />

      <Report
        title="Leads by source"
        rows={sourceRows}
        rowKey={(r) => r.source}
        columns={[
          { key: "s", label: "Source", width: 180, flex: 2, render: (r) => r.source },
          { key: "c", label: "Leads", width: 80, align: "right", render: (r) => r.count },
          { key: "o", label: "Open value", width: 140, align: "right", render: (r) => money(r.openValue) },
          { key: "wc", label: "Won", width: 80, align: "right", render: (r) => r.wonCount },
          { key: "wv", label: "Won value", width: 140, align: "right", render: (r) => money(r.wonValue) },
        ]}
        csv={{ header: ["Source", "Leads", "Open Value ($)", "Won", "Won Value ($)"], row: (r) => [r.source, r.count, r.openValue, r.wonCount, r.wonValue] }}
      />

      <Report
        title="Lost reasons"
        rows={lostReasons}
        rowKey={(r) => r.reason}
        columns={[
          { key: "r", label: "Reason", width: 220, flex: 2, render: (r) => r.reason },
          { key: "c", label: "Deals", width: 80, align: "right", render: (r) => r.count },
          { key: "v", label: "Value", width: 140, align: "right", render: (r) => money(r.value) },
        ]}
        csv={{ header: ["Reason", "Deals", "Value ($)"], row: (r) => [r.reason, r.count, r.value] }}
      />

      <Report
        title="Stale and past-due deals"
        rows={stale}
        rowKey={(r) => r.lead.id}
        onRowPress={(r) => router.push(`/leads/${r.lead.id}`)}
        columns={[
          { key: "c", label: "Lead", width: 180, flex: 2, render: (r) => r.lead.company },
          { key: "s", label: "Stage", width: 140, render: (r) => stagesById.get(r.lead.stage_id)?.name ?? "" },
          { key: "a", label: "Price", width: 120, align: "right", render: (r) => money(r.lead.amount) },
          { key: "d", label: "Days in stage", width: 110, align: "right", render: (r) => r.daysInStage },
          { key: "e", label: "Expected close", width: 130, render: (r) => r.lead.expected_close ?? "—" },
          ...(isManager ? [{ key: "o", label: "Owner", width: 140, render: (r: (typeof stale)[number]) => profileName(r.lead.owner_id) }] : []),
        ]}
        csv={{
          header: ["Lead", "Stage", "Price ($)", "Days In Stage", "Expected Close", "Owner"],
          row: (r) => [r.lead.company, stagesById.get(r.lead.stage_id)?.name, r.lead.amount, r.daysInStage, r.lead.expected_close, profileName(r.lead.owner_id)],
        }}
      />
    </Screen>
  );
}
