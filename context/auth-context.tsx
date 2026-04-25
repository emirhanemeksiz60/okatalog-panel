"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AuthSession } from "@/lib/types";
import {
  clearSession,
  getSessionFromStorage,
  setSessionInStorage,
} from "@/lib/supabase";

type AuthContextValue = {
  session: AuthSession | null;
  ready: boolean;
  login: (s: AuthSession) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getSessionFromStorage();
    queueMicrotask(() => {
      setSession(s);
      setReady(true);
    });
  }, []);

  const login = useCallback((s: AuthSession) => {
    setSessionInStorage(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    clearSession();
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
