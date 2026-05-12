import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";

const supabase = createFirmaServiceRoleClient();

/**
 * Supabase RPC `musteri_sifre_hash` — pgcrypto bcrypt, `musteriler.sifre`e yaz.
 */
export async function musteriSifreBcryptUret(duzMetin: string): Promise<string> {
  const { data, error } = await supabase.rpc("musteri_sifre_hash", {
    p_plain: duzMetin,
  });
  if (error) throw error;
  if (data == null || typeof data !== "string") {
    throw new Error("Sunucu şifre imzası döndürmedi.");
  }
  return data;
}

/**
 * `musteri_sifre_dogrula` — ileride müşteri (katalog) girişinde kullan.
 * `p_stored` veritabanındaki `musteriler.sifre` (bcrypt) sütunudur.
 */
export async function musteriSifreBcryptDogrula(
  duzMetin: string,
  kayitliBcrypt: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("musteri_sifre_dogrula", {
    p_plain: duzMetin,
    p_stored: kayitliBcrypt,
  });
  if (error) throw error;
  return data === true;
}
