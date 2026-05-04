"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AdminSession } from "@/lib/admin-auth";
import { clearLegacyAdminLocalStorage } from "@/lib/admin-auth";

type Ctx = {
  session: AdminSession | null;
  ready: boolean;
  login: (s: AdminSession) => void;
  logout: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | null>(null);

async function fetchAdminMe(): Promise<AdminSession | null> {
  const res = await fetch("/api/admin-me", { credentials: "include" });
  if (!res.ok) return null;
  const j = (await res.json()) as { ok?: boolean; kadi?: string };
  if (!j.ok) return null;
  return {
    kadi: typeof j.kadi === "string" ? j.kadi : "admin",
    role: "super",
    giris: new Date().toISOString(),
  };
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    clearLegacyAdminLocalStorage();
    let cancelled = false;
    void (async () => {
      try {
        const s = await fetchAdminMe();
        if (!cancelled) setSession(s);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((s: AdminSession) => {
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/admin-logout", { method: "POST", credentials: "include" });
    } finally {
      setSession(null);
    }
  }, []);

  return (
    <AdminAuthContext.Provider value={{ session, ready, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const c = useContext(AdminAuthContext);
  if (!c) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return c;
}
