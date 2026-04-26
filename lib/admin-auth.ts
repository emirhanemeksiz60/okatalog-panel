const ADMIN_KEY = "okatalog_superadmin_session";

export type AdminSession = {
  kadi: "admin";
  role: "super";
  giris: string;
};

const ADMIN_KADI = "admin";
const SUPER_PAROLA = "superadmin123";

export function adminGirisBeklenti(kadi: string, sifre: string): boolean {
  return (
    kadi.trim() === ADMIN_KADI && sifre === SUPER_PAROLA
  );
}

export function getAdminFromStorage(): AdminSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function setAdminInStorage(s: AdminSession) {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(s));
}

export function clearAdmin() {
  localStorage.removeItem(ADMIN_KEY);
}

export function yeniAdminSession(): AdminSession {
  return { kadi: "admin", role: "super", giris: new Date().toISOString() };
}
