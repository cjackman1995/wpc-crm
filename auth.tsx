import type { Session } from "@supabase/supabase-js";
import { router } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, unwrap } from "./supabase";
import type { Profile } from "./types";

interface AuthState {
  loading: boolean;
  profileLoading: boolean;
  session: Session | null;
  profile: Profile | null;
  isManager: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    try {
      const p = unwrap(await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle());
      setProfile((p as Profile | null) ?? null);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) setProfileLoading(true);
      // Don't await inside the callback (supabase-js deadlock guidance); load afterwards.
      setTimeout(() => loadProfile(s), 0);
      if (event === "PASSWORD_RECOVERY") router.replace("/reset-password");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value: AuthState = {
    loading,
    profileLoading,
    session,
    profile,
    isManager: profile?.role === "manager" && profile.active,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase.auth.signOut();
      router.replace("/login");
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
