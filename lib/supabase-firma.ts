import { supabase } from "@/lib/supabase";
import type { AuthSession, Firma } from "@/lib/types";

const DUMMY_PAROLA = "admin123";

/** `firmalar` — yalnız mevcut sütunlar (Supabase şema ile aynı) */
export const FIRMA_SUTUN_SECIM = [
  "id",
  "firma_kodu",
  "firma_adi",
  "logo_url",
  "slogan",
  "max_kategori",
  "max_fotograf",
  "max_musteri",
  "max_urun",
  "max_varyant",
  "aktif_paket",
  "paket_bitis_tarihi",
  "notlar",
  "aktif",
  "created_at",
].join(
  ", ",
);

export function firmaCoz(raw: unknown): Firma {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    firma_kodu: r.firma_kodu as string,
    firma_adi: r.firma_adi as string,
    logo_url: (r.logo_url as string) ?? null,
    slogan: (r.slogan as string) ?? null,
    max_kategori: Number(r.max_kategori ?? 10),
    max_fotograf: Number(r.max_fotograf ?? 500),
    max_musteri: Number(r.max_musteri ?? 50),
    max_urun: Number(r.max_urun ?? 100),
    max_varyant: Number(r.max_varyant ?? 500),
    aktif_paket: (r.aktif_paket as string) ?? null,
    paket_bitis_tarihi: (r.paket_bitis_tarihi as string) ?? null,
    notlar: (r.notlar as string) ?? null,
    aktif: Boolean(r.aktif),
    created_at: (r.created_at as string) ?? null,
  };
}

/**
 * Giriş: `firma_kodu` eşleşen aktif firma. Şifre: tabloda özel sütun olmadığı için
 * yalnızca sabit `admin123` kabul edilir.
 */
export async function signInWithFirma(
  firmaKodu: string,
  sifre: string,
): Promise<{ data: AuthSession; error: null } | { data: null; error: string }> {
  const { data, error } = await supabase
    .from("firmalar")
    .select(FIRMA_SUTUN_SECIM)
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
  return {
    data: {
      firma: firmaCoz(data),
      loggedInAt: new Date().toISOString(),
    },
    error: null,
  };
}
