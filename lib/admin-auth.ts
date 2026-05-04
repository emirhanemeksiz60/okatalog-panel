const ADMIN_KEY = "okatalog_superadmin_session";

export type AdminSession = {
  kadi: string;
  role: "super";
  giris: string;
};

if (!process.env.ADMIN_USERNAME?.trim() || !process.env.ADMIN_PASSWORD) {
  throw new Error(
    "ADMIN_USERNAME ve ADMIN_PASSWORD env degiskenleri tanimli olmali",
  );
}

const ADMIN_KADI = process.env.ADMIN_USERNAME.trim();
const ADMIN_PAROLA = process.env.ADMIN_PASSWORD;

export function adminGirisBeklenti(kadi: string, sifre: string): boolean {
  return kadi.trim() === ADMIN_KADI && sifre === ADMIN_PAROLA;
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
  return { kadi: ADMIN_KADI, role: "super", giris: new Date().toISOString() };
}
