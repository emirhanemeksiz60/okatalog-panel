import { createClient } from "@supabase/supabase-js";
import type { AuthSession, Firma } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Ortam değişkenleri gerekli: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local).",
  );
}
export const supabase = createClient(supabaseUrl, supabaseKey);

const AUTH_KEY = "okatalog_admin_session";
const DUMMY_PAROLA = "admin123";

export function getSessionFromStorage(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function setSessionInStorage(session: AuthSession) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

/**
 * Giriş: veritabanındaki `firma_kodu` eşleşen aktif firmayı arar; şifre `admin123` (geçici).
 * İleride firma veya yönetici parolası tabloya eklenebilir.
 */
export async function signInWithFirma(
  firmaKodu: string,
  sifre: string,
): Promise<{ data: AuthSession; error: null } | { data: null; error: string }> {
  const { data, error } = await supabase
    .from("firmalar")
    .select(
      "id, firma_kodu, firma_adi, logo_url, slogan, max_kategori, max_fotograf, max_musteri, aktif",
    )
    .eq("firma_kodu", firmaKodu.trim())
    .eq("aktif", true)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: "Firma kodu bulunamadı veya devre dışı." };
  }
  if (sifre !== DUMMY_PAROLA) {
    return { data: null, error: "Şifre hatalı." };
  }

  const session: AuthSession = {
    firma: data as Firma,
    loggedInAt: new Date().toISOString(),
  };
  return { data: session, error: null };
}
