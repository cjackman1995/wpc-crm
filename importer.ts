// Turns rows from a CSV or Excel file into lead records: finds the header row,
// guesses which column is which, and normalizes money, dates and stage names.
import type { LeadInput, Profile, Stage } from "./types";

export type Cell = string | number | boolean | Date | null | undefined;
export type MapTarget =
  | "ignore"
  | "company"
  | "contact_name"
  | "email"
  | "phone"
  | "equipment"
  | "amount"
  | "probability"
  | "expected_close"
  | "quote_number"
  | "source"
  | "notes"
  | "lost_reason"
  | "stage"
  | "owner";

export const TARGET_LABELS: Record<MapTarget, string> = {
  ignore: "— Don't import —",
  company: "Customer / Company",
  contact_name: "Contact Name",
  email: "Email",
  phone: "Phone",
  equipment: "Equipment",
  amount: "Price ($)",
  probability: "Probability (override)",
  expected_close: "Expected Close Date",
  quote_number: "Quote #",
  source: "Lead Source",
  notes: "Notes",
  lost_reason: "Lost Reason",
  stage: "Stage",
  owner: "Owner (name or email)",
};

// Header text (lowercased, punctuation stripped) -> field. Derived spreadsheet columns
// such as weighted revenue are ignored because the CRM calculates them.
const SYNONYMS: [RegExp, MapTarget][] = [
  [/^(weighted|close month|probability)/, "ignore"],
  [/^(customer|company|account|organization|organisation|business)( name)?$/, "company"],
  [/^(contact|contact name|name|full name|first and last name|lead name)$/, "contact_name"],
  [/e ?mail/, "email"],
  [/phone|mobile|cell|tel/, "phone"],
  [/equipment|product|item|model|machine/, "equipment"],
  [/price|amount|value|deal size|revenue|total/, "amount"],
  [/expected close|close date|closing date|est close/, "expected_close"],
  [/quote/, "quote_number"],
  [/source|origin|channel/, "source"],
  [/lost reason|reason lost/, "lost_reason"],
  [/note|comment|description/, "notes"],
  [/stage|status|phase/, "stage"],
  [/owner|rep|salesperson|assigned|account manager/, "owner"],
];

const clean = (v: Cell): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).replace(/\s+/g, " ").trim();
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function guessTarget(header: string): MapTarget {
  const h = norm(header);
  if (!h) return "ignore";
  for (const [re, target] of SYNONYMS) if (re.test(h)) return target;
  return "ignore";
}

/** Score how much a row looks like a header row for lead data. */
function headerScore(row: Cell[]): number {
  const texts = row.map(clean).filter(Boolean);
  if (texts.length < 2 || row.some((c) => typeof c === "number" || c instanceof Date)) return 0;
  return texts.filter((t) => guessTarget(t) !== "ignore").length;
}

export function findHeaderRow(rows: Cell[][]): number {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const s = headerScore(rows[i] ?? []);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}

/** For workbooks with several tabs, pick the one that looks most like a lead list. */
export function pickSheet(sheets: { sheet: string; data: Cell[][] }[]): number {
  let best = 0, bestScore = -1;
  sheets.forEach((s, i) => {
    const h = findHeaderRow(s.data);
    const score = h < 0 ? 0 : headerScore(s.data[h]) * 1000 + (s.data.length - h);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

export function guessMapping(headers: Cell[]): MapTarget[] {
  const used = new Set<MapTarget>();
  return headers.map((h) => {
    const t = guessTarget(clean(h));
    if (t === "ignore" || used.has(t)) return "ignore";
    used.add(t);
    return t;
  });
}

export function parseMoney(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v).replace(/[$,\s]/g, "");
  const m = /^(-?\d+(?:\.\d+)?)([kKmM])?$/.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]) * (m[2] ? (m[2].toLowerCase() === "k" ? 1_000 : 1_000_000) : 1);
  return Math.round(n * 100) / 100;
}

export function parseProbability(v: Cell): number | null {
  if (v == null || v === "") return null;
  let n = typeof v === "number" ? v : parseFloat(String(v).replace("%", ""));
  if (!Number.isFinite(n)) return null;
  if (n > 1) n = n / 100;
  return n >= 0 && n <= 1 ? n : null;
}

/** Accepts Date objects, Excel serial numbers, YYYY-MM-DD and M/D/YYYY. Returns YYYY-MM-DD. */
export function parseDate(v: Cell): string | null {
  if (v == null || v === "") return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Spreadsheet dates have no time zone; libraries hand them back as UTC midnight.
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86_400_000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${pad(+m[1])}-${pad(+m[2])}`;
  }
  return null;
}

export function matchStage(value: string, stages: Stage[]): Stage | null {
  const v = norm(value);
  if (!v) return null;
  const exact = stages.find((s) => norm(s.name) === v);
  if (exact) return exact;
  if (v === "won") return stages.find((s) => s.is_won) ?? null;
  if (v === "lost") return stages.find((s) => s.is_closed && !s.is_won) ?? null;
  return stages.find((s) => norm(s.name).startsWith(v) || v.startsWith(norm(s.name))) ?? null;
}

export function matchOwner(value: string, profiles: Profile[]): Profile | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return (
    profiles.find((p) => p.email.toLowerCase() === v) ??
    profiles.find((p) => p.full_name.toLowerCase() === v) ??
    profiles.find((p) => p.full_name.toLowerCase().startsWith(v)) ??
    null
  );
}

export interface PreparedRow {
  rowNumber: number; // 1-based row in the file, for messages
  lead: LeadInput & { company: string; stage_id: number; owner_id: string };
  warnings: string[];
}

export interface PrepareOptions {
  stages: Stage[];
  profiles: Profile[];
  defaultStageId: number;
  defaultOwnerId: string;
  allowOwnerColumn: boolean; // only managers may assign leads to other people
}

export function prepareRows(rows: Cell[][], headerRow: number, mapping: MapTarget[], opts: PrepareOptions): PreparedRow[] {
  const out: PreparedRow[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    if (row.every((c) => clean(c) === "")) continue;
    const lead: PreparedRow["lead"] = { company: "", stage_id: opts.defaultStageId, owner_id: opts.defaultOwnerId };
    const warnings: string[] = [];
    mapping.forEach((target, i) => {
      const cell = row[i];
      const text = clean(cell);
      if (target === "ignore" || text === "") return;
      switch (target) {
        case "amount": {
          const n = parseMoney(cell);
          if (n == null) warnings.push(`Price "${text}" isn't a number`);
          else lead.amount = n;
          break;
        }
        case "probability": {
          const n = parseProbability(cell);
          if (n == null) warnings.push(`Probability "${text}" isn't valid`);
          else lead.probability = n;
          break;
        }
        case "expected_close": {
          const d = parseDate(cell);
          if (d == null) warnings.push(`Date "${text}" not recognized`);
          else lead.expected_close = d;
          break;
        }
        case "stage": {
          const s = matchStage(text, opts.stages);
          if (s) lead.stage_id = s.id;
          else warnings.push(`Unknown stage "${text}", using default`);
          break;
        }
        case "owner": {
          if (!opts.allowOwnerColumn) break;
          const p = matchOwner(text, opts.profiles);
          if (p) lead.owner_id = p.id;
          else warnings.push(`No user named "${text}", using default owner`);
          break;
        }
        case "email":
          lead.email = text.toLowerCase();
          break;
        default:
          (lead as Record<string, unknown>)[target] = text;
      }
    });
    if (!lead.company) {
      if (lead.contact_name) lead.company = lead.contact_name;
      else continue; // nothing identifying this row
    }
    out.push({ rowNumber: r + 1, lead, warnings });
  }
  return out;
}

/** Keys used for duplicate detection, matching find_existing_leads() in the database. */
export const dupKeys = (lead: { email?: string | null; company: string }) => {
  const keys = [`company:${lead.company.trim().toLowerCase()}`];
  if (lead.email) keys.unshift(`email:${lead.email.trim().toLowerCase()}`);
  return keys;
};
