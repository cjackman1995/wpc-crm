export type Role = "rep" | "manager";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Stage {
  id: number;
  name: string;
  sort_order: number;
  probability: number;
  is_closed: boolean;
  is_won: boolean;
}

export interface Lead {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  equipment: string | null;
  amount: number | null;
  probability: number | null;
  expected_close: string | null; // YYYY-MM-DD
  quote_number: string | null;
  source: string | null;
  notes: string | null;
  lost_reason: string | null;
  stage_id: number;
  owner_id: string;
  stage_entered_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadInput = Partial<Omit<Lead, "id" | "created_at" | "updated_at" | "stage_entered_at" | "closed_at">>;

export interface StageChange {
  id: number;
  lead_id: string;
  from_stage_id: number | null;
  to_stage_id: number;
  changed_by: string | null;
  changed_at: string;
}

export type ActivityType = "note" | "call" | "email" | "meeting" | "stage_change" | "system";

export interface Activity {
  id: number;
  lead_id: string;
  user_id: string | null;
  type: ActivityType;
  body: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: "low" | "normal" | "high";
  status: "open" | "done";
  lead_id: string | null;
  owner_id: string;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Lead fields shown in tables, forms, import and export, in display order. */
export const LEAD_FIELDS: { key: keyof Lead; label: string; kind: "text" | "money" | "date" | "percent" | "long" }[] = [
  { key: "company", label: "Customer / Company", kind: "text" },
  { key: "contact_name", label: "Contact Name", kind: "text" },
  { key: "email", label: "Email", kind: "text" },
  { key: "phone", label: "Phone", kind: "text" },
  { key: "equipment", label: "Equipment", kind: "text" },
  { key: "amount", label: "Price ($)", kind: "money" },
  { key: "expected_close", label: "Expected Close", kind: "date" },
  { key: "quote_number", label: "Quote #", kind: "text" },
  { key: "source", label: "Lead Source", kind: "text" },
  { key: "notes", label: "Notes", kind: "long" },
];
