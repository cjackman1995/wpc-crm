import { useFocusEffect } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getProfiles, getStages } from "./api";
import { stageMap, type StageMap } from "./metrics";
import type { Profile, Stage } from "./types";

/** Loads data for a screen and reloads it whenever the screen comes back into focus. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );
  return { data, error, loading, reload, setData };
}

interface RefData {
  stages: Stage[];
  stagesById: StageMap;
  profiles: Profile[];
  profileName: (id: string | null | undefined) => string;
  reload: () => Promise<void>;
  ready: boolean;
  error: string | null;
}

const RefContext = createContext<RefData | null>(null);

/** Stages and the team list, shared by every screen. */
export function RefDataProvider({ children }: { children: ReactNode }) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([getStages(), getProfiles()]);
      setStages(s);
      setProfiles(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const byId = new Map(profiles.map((p) => [p.id, p]));
  const value: RefData = {
    stages,
    stagesById: stageMap(stages),
    profiles,
    profileName: (id) => {
      const p = id ? byId.get(id) : undefined;
      return p ? p.full_name || p.email : "—";
    },
    reload,
    ready,
    error,
  };
  return <RefContext.Provider value={value}>{children}</RefContext.Provider>;
}

export function useRefData(): RefData {
  const ctx = useContext(RefContext);
  if (!ctx) throw new Error("useRefData outside RefDataProvider");
  return ctx;
}
