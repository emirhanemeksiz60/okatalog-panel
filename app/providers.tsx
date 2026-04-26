"use client";

import { AuthProvider } from "@/context/auth-context";
import { AdminAuthProvider } from "@/context/admin-auth-context";
import { ToastProvider } from "@/context/toast-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminAuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AdminAuthProvider>
    </AuthProvider>
  );
}
