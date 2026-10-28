import { compareSync, hashSync } from "bcryptjs";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";

/**
 * Müşteri şifresi — panel `musteri_sifre_hash` migration ile aynı algoritma:
 * pgcrypto `crypt(..., gen_salt('bf', 10))` ≡ bcrypt cost 10.
 *
 * Üretimde `musteri_sifre_hash` RPC şema önbelleğinde yoksa (PGRST202)
 * Node tarafında aynı hash üretilir. Mobil giriş `verify_password` RPC
 * (pgcrypto crypt) ile doğrular; bcryptjs çıktısı onunla uyumludur.
 */
export async function musteriSifreBcryptUret(duzMetin: string): Promise<string> {
  const plain = String(duzMetin ?? "").trim();
  if (plain.length < 4) {
    throw new Error("Şifre en az 4 karakter olmalı");
  }

  // Panel dashboard/mutate ile aynı RPC çağrısı (varsa kullan)
  try {
    const sb = createFirmaServiceRoleClient();
    const { data, error } = await sb.rpc("musteri_sifre_hash", {
      p_plain: plain,
    });
    if (!error && typeof data === "string" && data.trim()) {
      return data;
    }
    if (error) {
      console.error(
        "[musteriSifreBcryptUret] rpc musteri_sifre_hash",
        (error as { message?: string }).message ?? error,
      );
    }
  } catch (e) {
    console.error(
      "[musteriSifreBcryptUret] rpc exception",
      e instanceof Error ? e.message : e,
    );
  }

  // RPC yok/hatalı → bcrypt cost 10; pgcrypto crypt() yalnızca "$2a$" önekini tanır
  // (bcryptjs varsayılanı "$2b$")
  return hashSync(plain, 10).replace(/^\$2b\$/, "$2a$");
}

/**
 * Yerel doğrulama (RPC `musteri_sifre_dogrula` yedeği).
 * Mobil müşteri girişi asıl olarak `verify_password` kullanır.
 */
export async function musteriSifreBcryptDogrula(
  duzMetin: string,
  kayitliBcrypt: string,
): Promise<boolean> {
  const plain = String(duzMetin ?? "");
  const stored = String(kayitliBcrypt ?? "");
  if (!plain || !stored) return false;

  try {
    const sb = createFirmaServiceRoleClient();
    const { data, error } = await sb.rpc("musteri_sifre_dogrula", {
      p_plain: plain,
      p_stored: stored,
    });
    if (!error) return data === true;
    console.error(
      "[musteriSifreBcryptDogrula] rpc",
      (error as { message?: string }).message ?? error,
    );
  } catch (e) {
    console.error(
      "[musteriSifreBcryptDogrula] rpc exception",
      e instanceof Error ? e.message : e,
    );
  }

  try {
    return compareSync(plain, stored);
  } catch {
    return false;
  }
}
