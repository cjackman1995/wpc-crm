// Pure reporting functions. Every screen (rep dashboard, manager dashboard, reports)
// runs these over whatever rows the database let the viewer see, so a rep's numbers
// are automatically their own and a manager's are company-wide.
import type { Lead, Profile, Stage, StageChange, Task } from "./types";
import { daysBetween, isoDate, monthKey, parseDay } from "./format";

export interface DateRange {
  from: Date | null; // inclusive
  to: Date | null; // exclusive
}

export type StageMap = Map<number, Stage>;
export const stageMap = (stages: Stage[]): StageMap => new Map(stages.map((s) => [s.id, s]));

export function probabilityOf(lead: Lead, stages: StageMap): number {
  if (lead.probability != null) return Number(lead.probability);
  return Number(stages.get(lead.stage_id)?.probability ?? 0);
}

export const isOpen = (lead: Lead, stages: StageMap) => !stages.get(lead.stage_id)?.is_closed;
export const isWon = (lead: Lead, stages: StageMap) => !!stages.get(lead.stage_id)?.is_won;
export const isLost = (lead: Lead, stages: StageMap) => {
  const s = stages.get(lead.stage_id);
  return !!s && s.is_closed && !s.is_won;
};

function inRange(iso: string | null, range?: DateRange): boolean {
  if (!iso) return false;
  if (!range) return true;
  const t = new Date(iso).getTime();
  if (range.from && t < range.from.getTime()) return false;
  if (range.to && t >= range.to.getTime()) return false;
  return true;
}

const amt = (l: Lead) => Number(l.amount ?? 0);

export interface Summary {
  openCount: number;
  openValue: number;
  weightedValue: number;
  avgOpenDeal: number | null;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  winRate: number | null;
}

/** Open pipeline is a snapshot; won/lost/win rate count deals closed inside `range`. */
export function summary(leads: Lead[], stages: StageMap, range?: DateRange): Summary {
  let openCount = 0, openValue = 0, weightedValue = 0, wonCount = 0, wonValue = 0, lostCount = 0;
  for (const l of leads) {
    if (isOpen(l, stages)) {
      openCount++;
      openValue += amt(l);
      weightedValue += amt(l) * probabilityOf(l, stages);
    } else if (inRange(l.closed_at, range)) {
      if (isWon(l, stages)) {
        wonCount++;
        wonValue += amt(l);
      } else lostCount++;
    }
  }
  return {
    openCount,
    openValue,
    weightedValue,
    avgOpenDeal: openCount ? openValue / openCount : null,
    wonCount,
    wonValue,
    lostCount,
    winRate: wonCount + lostCount ? wonCount / (wonCount + lostCount) : null,
  };
}

export interface StageRow {
  stage: Stage;
  count: number;
  value: number;
  weighted: number;
}

export function byStage(leads: Lead[], stages: Stage[]): StageRow[] {
  const map = stageMap(stages);
  const rows = new Map<number, StageRow>(
    [...stages].sort((a, b) => a.sort_order - b.sort_order).map((s) => [s.id, { stage: s, count: 0, value: 0, weighted: 0 }])
  );
  for (const l of leads) {
    const r = rows.get(l.stage_id);
    if (!r) continue;
    r.count++;
    r.value += amt(l);
    r.weighted += amt(l) * probabilityOf(l, map);
  }
  return [...rows.values()];
}

export interface MonthRow {
  key: string; // YYYY-MM
  weighted: number;
  total: number;
  count: number;
}

export interface Projection {
  months: MonthRow[];
  pastDue: { count: number; total: number; weighted: number };
  noDate: { count: number; total: number; weighted: number };
}

/** Open pipeline by expected close month, starting with the current month. */
export function projection(leads: Lead[], stages: StageMap, today: Date, monthsAhead = 12): Projection {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const months: MonthRow[] = [];
  for (let i = 0; i < monthsAhead; i++) {
    months.push({ key: monthKey(new Date(start.getFullYear(), start.getMonth() + i, 1)), weighted: 0, total: 0, count: 0 });
  }
  const index = new Map(months.map((m, i) => [m.key, i]));
  const pastDue = { count: 0, total: 0, weighted: 0 };
  const noDate = { count: 0, total: 0, weighted: 0 };
  for (const l of leads) {
    if (!isOpen(l, stages)) continue;
    const w = amt(l) * probabilityOf(l, stages);
    let bucket: { count: number; total: number; weighted: number } | undefined;
    if (!l.expected_close) bucket = noDate;
    else {
      const d = parseDay(l.expected_close);
      if (d < start) bucket = pastDue;
      else {
        const i = index.get(monthKey(d));
        bucket = i == null ? undefined : months[i];
      }
    }
    if (!bucket) continue; // beyond the window
    bucket.count++;
    bucket.total += amt(l);
    bucket.weighted += w;
  }
  return { months, pastDue, noDate };
}

export interface RepRow {
  profile: Profile;
  openCount: number;
  openValue: number;
  weighted: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  winRate: number | null;
  openTasks: number;
  overdueTasks: number;
}

export function leaderboard(
  leads: Lead[],
  stages: StageMap,
  profiles: Profile[],
  tasks: Task[],
  today: Date,
  range?: DateRange
): RepRow[] {
  const todayIso = isoDate(today);
  const rows = profiles
    .map((p) => {
      const mine = leads.filter((l) => l.owner_id === p.id);
      const s = summary(mine, stages, range);
      const myTasks = tasks.filter((t) => t.owner_id === p.id && t.status === "open");
      return {
        profile: p,
        openCount: s.openCount,
        openValue: s.openValue,
        weighted: s.weightedValue,
        wonCount: s.wonCount,
        wonValue: s.wonValue,
        lostCount: s.lostCount,
        winRate: s.winRate,
        openTasks: myTasks.length,
        overdueTasks: myTasks.filter((t) => t.due_date != null && t.due_date < todayIso).length,
      };
    })
    .filter((r) => (r.profile.active && r.profile.role === "rep") || r.openCount > 0 || r.wonCount > 0 || r.lostCount > 0);
  return rows.sort((a, b) => b.wonValue - a.wonValue || b.weighted - a.weighted);
}

export interface FunnelRow {
  stage: Stage;
  reached: number;
  conversionToNext: number | null;
}

/**
 * How many leads reached each stage (or went further), using stage history.
 * Closed Lost is left out: a lead lost at Proposal Sent counts as having reached Proposal Sent.
 */
export function funnel(leads: Lead[], stages: Stage[], changes: StageChange[]): FunnelRow[] {
  const map = stageMap(stages);
  const path = [...stages].filter((s) => !s.is_closed || s.is_won).sort((a, b) => a.sort_order - b.sort_order);
  const maxOrder = new Map<string, number>();
  const bump = (leadId: string, stageId: number) => {
    const s = map.get(stageId);
    if (!s || (s.is_closed && !s.is_won)) return;
    maxOrder.set(leadId, Math.max(maxOrder.get(leadId) ?? -Infinity, s.sort_order));
  };
  const visible = new Set(leads.map((l) => l.id));
  for (const l of leads) bump(l.id, l.stage_id);
  for (const c of changes) if (visible.has(c.lead_id)) bump(c.lead_id, c.to_stage_id);
  const reached = path.map((s) => [...maxOrder.values()].filter((o) => o >= s.sort_order).length);
  return path.map((stage, i) => ({
    stage,
    reached: reached[i],
    conversionToNext: i < path.length - 1 && reached[i] > 0 ? reached[i + 1] / reached[i] : null,
  }));
}

export interface StageTimeRow {
  stage: Stage;
  completedStays: number;
  avgDaysCompleted: number | null;
  currentCount: number;
  avgDaysCurrent: number | null;
}

/** Average time spent in each stage: finished stays from history, plus the age of leads sitting there now. */
export function timeInStage(leads: Lead[], stages: Stage[], changes: StageChange[], today: Date): StageTimeRow[] {
  const byLead = new Map<string, StageChange[]>();
  for (const c of changes) {
    const list = byLead.get(c.lead_id) ?? [];
    list.push(c);
    byLead.set(c.lead_id, list);
  }
  const done = new Map<number, number[]>();
  for (const list of byLead.values()) {
    list.sort((a, b) => a.changed_at.localeCompare(b.changed_at));
    for (let i = 0; i < list.length - 1; i++) {
      const d = daysBetween(new Date(list[i].changed_at), new Date(list[i + 1].changed_at));
      const arr = done.get(list[i].to_stage_id) ?? [];
      arr.push(d);
      done.set(list[i].to_stage_id, arr);
    }
  }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return [...stages]
    .filter((s) => !s.is_closed)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((stage) => {
      const current = leads.filter((l) => l.stage_id === stage.id).map((l) => daysBetween(new Date(l.stage_entered_at), today));
      const finished = done.get(stage.id) ?? [];
      return {
        stage,
        completedStays: finished.length,
        avgDaysCompleted: avg(finished),
        currentCount: current.length,
        avgDaysCurrent: avg(current),
      };
    });
}

export interface SourceRow {
  source: string;
  count: number;
  openValue: number;
  wonCount: number;
  wonValue: number;
}

export function bySource(leads: Lead[], stages: StageMap): SourceRow[] {
  const rows = new Map<string, SourceRow>();
  for (const l of leads) {
    const key = l.source?.trim() || "(none)";
    const r = rows.get(key) ?? { source: key, count: 0, openValue: 0, wonCount: 0, wonValue: 0 };
    r.count++;
    if (isOpen(l, stages)) r.openValue += amt(l);
    if (isWon(l, stages)) {
      r.wonCount++;
      r.wonValue += amt(l);
    }
    rows.set(key, r);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count);
}

export interface ClosedMonthRow {
  key: string;
  wonValue: number;
  wonCount: number;
  lostCount: number;
}

/** Won and lost deals by month closed, for the last `months` months including this one. */
export function closedByMonth(leads: Lead[], stages: StageMap, today: Date, months = 12): ClosedMonthRow[] {
  const rows: ClosedMonthRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    rows.push({ key: monthKey(new Date(today.getFullYear(), today.getMonth() - i, 1)), wonValue: 0, wonCount: 0, lostCount: 0 });
  }
  const index = new Map(rows.map((r, i) => [r.key, i]));
  for (const l of leads) {
    if (!l.closed_at) continue;
    const i = index.get(monthKey(new Date(l.closed_at)));
    if (i == null) continue;
    if (isWon(l, stages)) {
      rows[i].wonCount++;
      rows[i].wonValue += amt(l);
    } else if (isLost(l, stages)) rows[i].lostCount++;
  }
  return rows;
}

export interface StaleLead {
  lead: Lead;
  daysInStage: number;
  pastDue: boolean;
}

/** Open leads that need attention: stuck in a stage too long, or past their expected close date. */
export function staleLeads(leads: Lead[], stages: StageMap, today: Date, days = 30): StaleLead[] {
  const todayIso = isoDate(today);
  return leads
    .filter((l) => isOpen(l, stages))
    .map((l) => ({
      lead: l,
      daysInStage: Math.floor(daysBetween(new Date(l.stage_entered_at), today)),
      pastDue: l.expected_close != null && l.expected_close < todayIso,
    }))
    .filter((r) => r.daysInStage >= days || r.pastDue)
    .sort((a, b) => Number(b.pastDue) - Number(a.pastDue) || b.daysInStage - a.daysInStage);
}

export type RangePreset = "all" | "month" | "quarter" | "year" | "last12";

export function presetRange(p: RangePreset, today: Date): DateRange | undefined {
  const y = today.getFullYear(), m = today.getMonth();
  switch (p) {
    case "all":
      return undefined;
    case "month":
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: new Date(y, q, 1), to: new Date(y, q + 3, 1) };
    }
    case "year":
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
    case "last12":
      return { from: new Date(y, m - 11, 1), to: new Date(y, m + 1, 1) };
  }
}

export const RANGE_LABELS: Record<RangePreset, string> = {
  all: "All time",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
  last12: "Last 12 months",
};
