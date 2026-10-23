import { test } from "node:test";
import assert from "node:assert/strict";
import { findHeaderRow, guessMapping, matchStage, parseDate, parseMoney, pickSheet, prepareRows } from "./importer";
import type { Profile, Stage } from "./types";

const stages: Stage[] = [
  { id: 1, name: "Lead / Inquiry", sort_order: 1, probability: 0.05, is_closed: false, is_won: false },
  { id: 4, name: "Proposal Sent", sort_order: 4, probability: 0.35, is_closed: false, is_won: false },
  { id: 8, name: "Closed Won", sort_order: 8, probability: 1, is_closed: true, is_won: true },
  { id: 9, name: "Closed Lost", sort_order: 9, probability: 0, is_closed: true, is_won: false },
];
const profiles: Profile[] = [
  { id: "u1", email: "cooper@example.com", full_name: "Cooper Jackman", role: "rep", active: true, created_at: "" },
];

test("finds a header row below a title row and maps tracker columns", () => {
  const rows = [
    ["Pipeline Tracker"],
    [],
    ["Customer Name", "Contact Name", "Email", "Phone", "Equipment", "Price ($)", "Stage", "Probability",
     "Expected Close Date", "Weighted Revenue ($)", "Close Month", "Quote #", "Notes"],
    ["Sercel ", "Lance", "LANCE@X.COM", "832", "Double Roll Crusher", 132419, "proposal sent", 0.35,
     new Date(Date.UTC(2026, 9, 1)), 46346, null, "Emailed", "Follow up"],
  ];
  const h = findHeaderRow(rows);
  assert.equal(h, 2);
  const mapping = guessMapping(rows[h]);
  assert.deepEqual(mapping, ["company", "contact_name", "email", "phone", "equipment", "amount", "stage", "ignore",
    "expected_close", "ignore", "ignore", "quote_number", "notes"]);
  const [r] = prepareRows(rows, h, mapping, { stages, profiles, defaultStageId: 1, defaultOwnerId: "me", allowOwnerColumn: false });
  assert.equal(r.lead.company, "Sercel");
  assert.equal(r.lead.email, "lance@x.com");
  assert.equal(r.lead.stage_id, 4);
  assert.equal(r.lead.amount, 132419);
  assert.equal(r.lead.expected_close, "2026-10-01");
  assert.equal(r.lead.owner_id, "me");
  assert.deepEqual(r.warnings, []);
});

test("picks the data tab over a dashboard tab", () => {
  const sheets = [
    { sheet: "Dashboard", data: [["Open Pipeline"], [123]] },
    { sheet: "Pipeline", data: [["Customer Name", "Stage", "Price"], ["A", "Won", 5]] },
  ];
  assert.equal(pickSheet(sheets), 1);
});

test("normalizes money, dates and stage names", () => {
  assert.equal(parseMoney("$1,250,000"), 1250000);
  assert.equal(parseMoney("450k"), 450000);
  assert.equal(parseMoney("tbd"), null);
  assert.equal(parseDate("9/15/2026"), "2026-09-15");
  assert.equal(parseDate(46296), "2026-10-01"); // Excel serial
  assert.equal(matchStage("Won", stages)?.id, 8);
  assert.equal(matchStage("lead", stages)?.id, 1);
  assert.equal(matchStage("Nope", stages), null);
});

test("owner column only applies when allowed; rows without a company use the contact", () => {
  const rows = [["Contact", "Owner", "Stage"], ["Pat Doe", "cooper jackman", "mystery"]];
  const mapping = guessMapping(rows[0]);
  const asRep = prepareRows(rows, 0, mapping, { stages, profiles, defaultStageId: 1, defaultOwnerId: "me", allowOwnerColumn: false });
  assert.equal(asRep[0].lead.owner_id, "me");
  assert.equal(asRep[0].lead.company, "Pat Doe");
  assert.match(asRep[0].warnings[0], /Unknown stage/);
  const asMgr = prepareRows(rows, 0, mapping, { stages, profiles, defaultStageId: 1, defaultOwnerId: "me", allowOwnerColumn: true });
  assert.equal(asMgr[0].lead.owner_id, "u1");
});
