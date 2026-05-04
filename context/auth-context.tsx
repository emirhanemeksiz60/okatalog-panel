"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AuthSession } from "@/lib/types";
import { clearFirmSession } from "@/lib/firma-storage";

type AuthContextValue = {
  session: AuthSession | null;
  ready: boolean;
  login: (s: AuthSession) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/firma-me", { credentials: "include" });
        if (cancelled) return;
        if (r.ok) {
          const j = (await r.json()) as { ok?: boolean; session?: AuthSession };
          if (j.ok && j.session) {
            setSession(j.session);
          } else {
            clearFirmSession();
            setSession(null);
          }
        } else {
          clearFirmSession();
          setSession(null);
        }
      } catch {
        if (!cancelled) {
          clearFirmSession();
          setSession(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((s: AuthSession) => {
    clearFirmSession();
    setSession(s);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/firma-logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
    clearFirmSession();
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
