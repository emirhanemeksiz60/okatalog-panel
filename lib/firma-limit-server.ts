import { toplamFotografGorselUrl } from "@/lib/admin-istatistik";
import type { FirmaLimitBilgisi } from "@/lib/firma-limit-usage";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";

type FirmaSb = ReturnType<typeof createFirmaServiceRoleClient>;

const L = (n: number, d: number) => (Number.isFinite(n) && n > 0 ? n : d);

/** Yalnız route handler sunucusu — anon istemci bundle’ına import etmeyin. */
export async function firmaLimitBilgisiSb(
  sb: FirmaSb,
  firmaId: string,
): Promise<FirmaLimitBilgisi> {
  const fRes = await sb
    .from("firmalar")
    .select("max_kategori, max_musteri, max_urun, max_fotograf")
    .eq("id", firmaId)
    .maybeSingle();
  if (fRes.error) throw fRes.error;
  const fr = fRes.data as {
    max_kategori: number | null;
    max_musteri: number | null;
    max_urun: number | null;
    max_fotograf: number | null;
  } | null;
  const limits = {
    max_kategori: L(fr?.max_kategori ?? 10, 10),
    max_musteri: L(fr?.max_musteri ?? 50, 50),
    max_urun: L(fr?.max_urun ?? 100, 100),
    max_fotograf: L(fr?.max_fotograf ?? 500, 500),
  };

  const [kat, mst, urn, urows] = await Promise.all([
    sb
      .from("kategoriler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId)
      .eq("ozel", false),
    sb
      .from("musteriler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId),
    sb
      .from("urunler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId),
    sb.from("urunler").select("id").eq("firma_id", firmaId),
  ]);
  if (kat.error) throw kat.error;
  if (mst.error) throw mst.error;
  if (urn.error) throw urn.error;
  if (urows.error) throw urows.error;

  const urunIdler = (urows.data as { id: string }[] | null) ?? [];
  let fotograf = 0;
  if (urunIdler.length > 0) {
    const uids = urunIdler.map((r) => r.id);
    const { data: vrows, error: ve } = await sb
      .from("varyantlar")
      .select("gorsel_url")
      .in("urun_id", uids);
    if (ve) throw ve;
    for (const v of (vrows as { gorsel_url: string | null }[] | null) ?? []) {
      fotograf += toplamFotografGorselUrl(v.gorsel_url);
    }
  }

  return {
    limits,
    kullanim: {
      kategori: kat.count ?? 0,
      musteri: mst.count ?? 0,
      urun: urn.count ?? 0,
      fotograf,
    },
  };
}
