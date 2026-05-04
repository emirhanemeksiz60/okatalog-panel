/**
 * Admin panel istemci oturumu (UI): cookie tabanlı doğrulama sunucuda yapılır.
 * Sunucu / middleware: `@/lib/admin-session` → `isAdminAuthenticated`, `verifyAdminSessionToken`.
 */

export type AdminSession = {
  kadi: string;
  role: "super";
  giris: string;
};

const ADMIN_KEY = "okatalog_superadmin_session";

/** Eski localStorage tabanlı admin oturumunu temizler. */
export function clearLegacyAdminLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
}
