import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Snapshot } from "../../supabase/functions/_shared/domain";
import * as api from "./api";

type Store = {
  data: Snapshot | null;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
  act: typeof api.command;
  busy: boolean;
  notice: string;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      setData(await api.snapshot());
      setError("");
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const sub = api.supabase?.auth.onAuthStateChange(() => {
      setData(null);
      setTimeout(() => void refresh(), 0);
    });
    return () => sub?.data.subscription.unsubscribe();
  }, [refresh]);
  const hasJobs = data?.audits.some((a) =>
    ["Processing", "Assessing", "Deleting"].includes(a.status),
  );
  useEffect(() => {
    const timer = hasJobs
      ? setInterval(() => {
          if (!document.hidden) void refresh();
        }, 5000)
      : undefined;
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [hasJobs, refresh]);
  const act: typeof api.command = async (action, payload) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await api.command(action, payload);
      await refresh();
      setNotice("Saved.");
      return result;
    } catch (e) {
      setNotice((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{ data, error, loading, refresh, act, busy, notice }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing store.");
  return value;
}
