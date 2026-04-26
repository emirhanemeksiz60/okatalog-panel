import type { AuthSession } from "@/lib/types";

const FIRMA_KEY = "okatalog_firma_session";
const FIRMA_KEY_LEGACY = "okatalog_admin_session";

export function getFirmSessionFromStorage(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(FIRMA_KEY) ??
      localStorage.getItem(FIRMA_KEY_LEGACY);
    if (!raw) return null;
    if (!localStorage.getItem(FIRMA_KEY) && localStorage.getItem(FIRMA_KEY_LEGACY)) {
      localStorage.setItem(FIRMA_KEY, raw);
      localStorage.removeItem(FIRMA_KEY_LEGACY);
    }
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setFirmSessionInStorage(session: AuthSession) {
  localStorage.setItem(FIRMA_KEY, JSON.stringify(session));
  try {
    localStorage.removeItem(FIRMA_KEY_LEGACY);
  } catch {
    /* ignore */
  }
}

export function clearFirmSession() {
  localStorage.removeItem(FIRMA_KEY);
  localStorage.removeItem(FIRMA_KEY_LEGACY);
}
