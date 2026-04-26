"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AdminSession } from "@/lib/admin-auth";
import { clearAdmin, getAdminFromStorage, setAdminInStorage } from "@/lib/admin-auth";

type Ctx = {
  session: AdminSession | null;
  ready: boolean;
  login: (s: AdminSession) => void;
  logout: () => void;
};

const AdminAuthContext = createContext<Ctx | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getAdminFromStorage();
    queueMicrotask(() => {
      setSession(s);
      setReady(true);
    });
  }, []);

  const login = useCallback((s: AdminSession) => {
    setAdminInStorage(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    clearAdmin();
    setSession(null);
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
