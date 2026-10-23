// All database access goes through here. Row-level security in Postgres decides what
// each person can see; nothing in this file filters by role for security purposes.
import { supabase, unwrap } from "./supabase";
import type { Activity, ActivityType, Lead, LeadInput, Profile, Stage, StageChange, Task } from "./types";

const PAGE = 1000; // Supabase's default max rows per request

/** Reads every row of a query, a page at a time. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = unwrap(await build(from, from + PAGE - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// ---- reference data

export async function getStages(): Promise<Stage[]> {
  const rows = unwrap(await supabase.from("stages").select("*").order("sort_order"));
  return (rows as Stage[]).map((s) => ({ ...s, probability: Number(s.probability) }));
}

export async function getProfiles(): Promise<Profile[]> {
  return unwrap(await supabase.from("profiles").select("*").order("full_name")) as Profile[];
}

export async function saveStage(stage: Partial<Stage> & { name: string; sort_order: number; probability: number }) {
  const { id, ...rest } = stage;
  if (id) unwrap(await supabase.from("stages").update(rest).eq("id", id));
  else unwrap(await supabase.from("stages").insert(rest));
}

export async function deleteStage(id: number) {
  unwrap(await supabase.from("stages").delete().eq("id", id));
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, "full_name" | "role" | "active">>) {
  unwrap(await supabase.from("profiles").update(patch).eq("id", id));
}

export async function transferBook(fromUser: string, toUser: string): Promise<number> {
  return unwrap(await supabase.rpc("transfer_book", { from_user: fromUser, to_user: toUser })) as number;
}

// ---- leads

const normalizeLead = (l: Lead): Lead => ({
  ...l,
  amount: l.amount == null ? null : Number(l.amount),
  probability: l.probability == null ? null : Number(l.probability),
});

export async function getLeads(): Promise<Lead[]> {
  const rows = await fetchAll<Lead>((a, b) => supabase.from("leads").select("*").order("updated_at", { ascending: false }).range(a, b));
  return rows.map(normalizeLead);
}

export async function getLead(id: string): Promise<Lead | null> {
  const row = unwrap(await supabase.from("leads").select("*").eq("id", id).maybeSingle()) as Lead | null;
  return row ? normalizeLead(row) : null;
}

export async function createLead(input: LeadInput & { company: string; stage_id: number }): Promise<Lead> {
  return normalizeLead(unwrap(await supabase.from("leads").insert(input).select().single()) as Lead);
}

export async function updateLead(id: string, patch: LeadInput): Promise<Lead> {
  const row = unwrap(await supabase.from("leads").update(patch).eq("id", id).select().maybeSingle()) as Lead | null;
  if (!row) throw new Error("This lead couldn't be saved. It may have been reassigned or deleted.");
  return normalizeLead(row);
}

export async function deleteLead(id: string) {
  const rows = unwrap(await supabase.from("leads").delete().eq("id", id).select("id")) as { id: string }[];
  if (!rows.length) throw new Error("Only managers can delete leads.");
}

export async function getStageChanges(): Promise<StageChange[]> {
  return fetchAll<StageChange>((a, b) => supabase.from("stage_changes").select("*").order("id").range(a, b));
}

/** Inserts in batches; returns how many were created. */
export async function importLeads(rows: (LeadInput & { company: string; stage_id: number; owner_id: string })[], onProgress?: (done: number) => void) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 250) {
    const batch = rows.slice(i, i + 250);
    unwrap(await supabase.from("leads").insert(batch));
    done += batch.length;
    onProgress?.(done);
  }
  return done;
}

/** Which emails / companies already exist anywhere in the CRM, and who owns them. */
export async function findExisting(emails: string[], companies: string[]): Promise<Map<string, string>> {
  const rows = unwrap(await supabase.rpc("find_existing_leads", { emails, companies })) as { match_key: string; owner_name: string }[];
  return new Map((rows ?? []).map((r) => [r.match_key, r.owner_name]));
}

// ---- activity timeline

export async function getActivities(leadId: string): Promise<Activity[]> {
  return unwrap(
    await supabase.from("activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false })
  ) as Activity[];
}

export async function addActivity(leadId: string, userId: string, type: ActivityType, body: string) {
  unwrap(await supabase.from("activities").insert({ lead_id: leadId, user_id: userId, type, body }));
}

export async function deleteActivity(id: number) {
  unwrap(await supabase.from("activities").delete().eq("id", id));
}

// ---- tasks

export async function getTasks(opts: { leadId?: string } = {}): Promise<Task[]> {
  return fetchAll<Task>((a, b) => {
    let q = supabase.from("tasks").select("*");
    if (opts.leadId) q = q.eq("lead_id", opts.leadId);
    return q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at").range(a, b);
  });
}

export async function createTask(t: Partial<Task> & { title: string }) {
  unwrap(await supabase.from("tasks").insert(t));
}

export async function updateTask(id: string, patch: Partial<Task>) {
  unwrap(await supabase.from("tasks").update(patch).eq("id", id));
}

export async function deleteTask(id: string) {
  unwrap(await supabase.from("tasks").delete().eq("id", id));
}

// ---- account

export async function changePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
