import { test } from "node:test";
import assert from "node:assert/strict";
import { byStage, funnel, leaderboard, projection, staleLeads, stageMap, summary, timeInStage } from "./metrics";
import type { Lead, Profile, Stage, StageChange } from "./types";

const stages: Stage[] = [
  { id: 1, name: "Lead / Inquiry", sort_order: 1, probability: 0.05, is_closed: false, is_won: false },
  { id: 2, name: "Proposal Sent", sort_order: 2, probability: 0.35, is_closed: false, is_won: false },
  { id: 3, name: "Negotiation", sort_order: 3, probability: 0.75, is_closed: false, is_won: false },
  { id: 8, name: "Closed Won", sort_order: 8, probability: 1, is_closed: true, is_won: true },
  { id: 9, name: "Closed Lost", sort_order: 9, probability: 0, is_closed: true, is_won: false },
];
const sm = stageMap(stages);
const today = new Date(2026, 9, 23);

let n = 0;
const lead = (p: Partial<Lead>): Lead => ({
  id: `L${++n}`, company: "Co", contact_name: null, email: null, phone: null, equipment: null, amount: null,
  probability: null, expected_close: null, quote_number: null, source: null, notes: null, lost_reason: null,
  stage_id: 1, owner_id: "a", stage_entered_at: "2026-10-01T00:00:00Z", closed_at: null,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...p,
});

const leads = [
  lead({ id: "A", amount: 100000, stage_id: 2, owner_id: "a", expected_close: "2026-11-15" }),
  lead({ id: "B", amount: 200000, stage_id: 3, owner_id: "b", probability: 0.5, expected_close: "2026-08-01" }),
  lead({ id: "C", amount: 50000, stage_id: 8, owner_id: "a", closed_at: "2026-10-05T00:00:00Z" }),
  lead({ id: "D", amount: 70000, stage_id: 9, owner_id: "b", closed_at: "2026-03-05T00:00:00Z" }),
  lead({ id: "E", amount: null, stage_id: 1, owner_id: "a", stage_entered_at: "2026-07-01T00:00:00Z" }),
];

test("summary matches the spreadsheet's dashboard formulas", () => {
  const s = summary(leads, sm);
  assert.equal(s.openCount, 3);
  assert.equal(s.openValue, 300000);
  assert.equal(s.weightedValue, 100000 * 0.35 + 200000 * 0.5); // B uses its override
  assert.equal(s.wonValue, 50000);
  assert.equal(s.winRate, 0.5);
  assert.equal(s.avgOpenDeal, 100000);
});

test("date range limits closed deals but not the open pipeline", () => {
  const s = summary(leads, sm, { from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) });
  assert.equal(s.openValue, 300000);
  assert.equal(s.wonCount, 1);
  assert.equal(s.lostCount, 0);
  assert.equal(s.winRate, 1);
});

test("by stage and projection", () => {
  const rows = byStage(leads, stages);
  assert.deepEqual(rows.map((r) => r.count), [1, 1, 1, 1, 1]);
  const p = projection(leads, sm, today);
  assert.equal(p.months[0].key, "2026-10");
  assert.equal(p.months[1].total, 100000);
  assert.equal(p.pastDue.total, 200000);
  assert.equal(p.noDate.count, 1);
});

test("leaderboard splits by owner", () => {
  const profiles: Profile[] = [
    { id: "a", email: "a@x", full_name: "A", role: "rep", active: true, created_at: "" },
    { id: "b", email: "b@x", full_name: "B", role: "rep", active: true, created_at: "" },
  ];
  const rows = leaderboard(leads, sm, profiles, [], today);
  assert.equal(rows[0].profile.id, "a");
  assert.equal(rows[0].wonValue, 50000);
  assert.equal(rows[1].openValue, 200000);
});

test("funnel counts leads that reached each stage, ignoring Closed Lost", () => {
  const changes: StageChange[] = [
    { id: 1, lead_id: "D", from_stage_id: null, to_stage_id: 2, changed_by: null, changed_at: "2026-02-01T00:00:00Z" },
    { id: 2, lead_id: "D", from_stage_id: 2, to_stage_id: 9, changed_by: null, changed_at: "2026-03-05T00:00:00Z" },
  ];
  const f = funnel(leads, stages, changes);
  assert.deepEqual(f.map((r) => [r.stage.name, r.reached]), [
    // A won deal counts as having passed through every earlier stage; D was lost after Proposal Sent.
    ["Lead / Inquiry", 5], ["Proposal Sent", 4], ["Negotiation", 2], ["Closed Won", 1],
  ]);
  const t = timeInStage(leads, stages, changes, today);
  assert.equal(t.find((r) => r.stage.id === 2)?.avgDaysCompleted, 32);
});

test("stale leads: past due first, then longest in stage", () => {
  const s = staleLeads(leads, sm, today);
  assert.deepEqual(s.map((r) => r.lead.id), ["B", "E"]);
});
