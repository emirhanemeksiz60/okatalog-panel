import { createClient } from "@supabase/supabase-js";
import { aktifPaketKoduCoz } from "@/lib/admin-paketler";
import type { Firma } from "@/lib/types";

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
  "max_ai_gunluk",
  "ai_kullanim_bugun",
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
    max_ai_gunluk: Number(r.max_ai_gunluk ?? 5),
    ai_kullanim_bugun: Number(r.ai_kullanim_bugun ?? 0),
    aktif_paket: aktifPaketKoduCoz(r.aktif_paket as string | null),
    paket_bitis_tarihi: (r.paket_bitis_tarihi as string) ?? null,
    notlar: (r.notlar as string) ?? null,
    aktif: Boolean(r.aktif),
    created_at: (r.created_at as string) ?? null,
  };
}

/**
 * Yalnız Route Handler / sunucu. `SUPABASE_SERVICE_ROLE_KEY` gerekir.
 * İstemci tarafında çağırma.
 */
export function createFirmaServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY tanımlı değil.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
