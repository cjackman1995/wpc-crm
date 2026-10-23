import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** False when the Supabase keys haven't been set; the app shows setup instructions instead of crashing. */
export const isConfigured = Boolean(url && key && !url.includes("YOUR-PROJECT"));

export const supabase: SupabaseClient = createClient(url || "http://localhost", key || "missing", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // handles password-reset and invite links
  },
});

/** Throws the Supabase error so screens can show one message path. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
