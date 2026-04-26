import { supabase } from "@/lib/supabase";
import { toplamFotografGorselUrl } from "@/lib/admin-istatistik";

export type FirmaSatirIstat = {
  firma_id: string;
  urun: number;
  musteri: number;
  fotograf: number;
};

export type PlatformOzet = {
  toplam_firma: number;
  aktif_firma: number;
  toplam_urun: number;
  toplam_musteri: number;
  toplam_fotograf: number;
};

export async function yuklePlatformOzet(): Promise<PlatformOzet> {
  const [f, u, m, v] = await Promise.all([
    supabase.from("firmalar").select("id, aktif"),
    supabase.from("urunler").select("id", { count: "exact", head: true }),
    supabase.from("musteriler").select("id", { count: "exact", head: true }),
    supabase.from("varyantlar").select("urun_id, gorsel_url"),
  ]);
  if (f.error) throw f.error;
  if (u.error) throw u.error;
  if (m.error) throw m.error;
  if (v.error) throw v.error;
  const firmas = f.data as { id: string; aktif: boolean }[];
  const toplamFot = ((v.data as { urun_id: string; gorsel_url: string | null }[]) ?? []).reduce(
    (s, r) => s + toplamFotografGorselUrl(r.gorsel_url),
    0,
  );
  return {
    toplam_firma: firmas.length,
    aktif_firma: firmas.filter((x) => x.aktif).length,
    toplam_urun: u.count ?? 0,
    toplam_musteri: m.count ?? 0,
    toplam_fotograf: toplamFot,
  };
}

export async function firmaBasiIstatikler(
  firmaIdler: string[],
): Promise<Map<string, FirmaSatirIstat>> {
  const m = new Map<string, FirmaSatirIstat>();
  for (const id of firmaIdler) {
    m.set(id, { firma_id: id, urun: 0, musteri: 0, fotograf: 0 });
  }
  if (firmaIdler.length === 0) return m;

  const { data: urunler, error: eu } = await supabase
    .from("urunler")
    .select("id, firma_id");
  if (eu) throw eu;
  const { data: musteriler, error: em } = await supabase
    .from("musteriler")
    .select("firma_id");
  if (em) throw em;
  const { data: varray, error: ev } = await supabase
    .from("varyantlar")
    .select("urun_id, gorsel_url");
  if (ev) throw ev;

  const urows = (urunler as { id: string; firma_id: string }[]) ?? [];
  const urunToFirma = new Map(urows.map((u) => [u.id, u.firma_id] as const));
  (musteriler as { firma_id: string }[])?.forEach((row) => {
    if (!m.has(row.firma_id)) return;
    const x = m.get(row.firma_id)!;
    m.set(row.firma_id, { ...x, musteri: x.musteri + 1 });
  });
  urows.forEach((r) => {
    if (!m.has(r.firma_id)) return;
    const x = m.get(r.firma_id)!;
    m.set(r.firma_id, { ...x, urun: x.urun + 1 });
  });
  (varray as { urun_id: string; gorsel_url: string | null }[])?.forEach((r) => {
    const fd = urunToFirma.get(r.urun_id);
    if (fd == null) return;
    if (!m.has(fd)) return;
    const x = m.get(fd)!;
    m.set(fd, {
      ...x,
      fotograf: x.fotograf + toplamFotografGorselUrl(r.gorsel_url),
    });
  });
  return m;
}

/** Tek firma: gerçek kullanım (COUNT + varyantlardan foto) */
export type FirmaKullanimOzet = {
  kategori: number;
  musteri: number;
  urun: number;
  varyant: number;
  fotograf: number;
};

const DEV = process.env.NODE_ENV === "development";

function logKull(asama: string, ek?: Record<string, unknown>) {
  if (DEV) {
    console.log(`[firmaKullanimOzet] ${asama}`, ek ?? "");
  }
}

/**
 * Kullanım; ardışık sorgu + her biri ayrı try/catch. Hangi sorgu patlarsa konsol
 * "[firmaKullanimOzet] …" ile görünür.
 */
export async function firmaKullanimOzet(
  firmaId: string,
): Promise<FirmaKullanimOzet> {
  logKull("başla", { firmaId, tip: typeof firmaId, len: firmaId?.length });
  if (!firmaId) {
    throw new Error("firmaKullanimOzet: firmaId boş");
  }

  type Sayim = { count: number | null; error: { message: string } | null };
  type IdList = { data: { id: string }[] | null; error: { message: string } | null };
  type Vry = { data: { gorsel_url: string | null }[] | null; error: { message: string } | null };

  let kc: Sayim;
  try {
    kc = (await supabase
      .from("kategoriler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId)) as unknown as Sayim;
    logKull("1 kategoriler count cevabı", { data: kc, error: kc.error, count: kc.count });
  } catch (e) {
    console.error("[firmaKullanimOzet] 1 kategoriler exception", e);
    throw e;
  }
  if (kc.error) {
    console.error("[firmaKullanimOzet] 1 kategoriler hata", kc.error);
    throw kc.error;
  }

  let mc: Sayim;
  try {
    mc = (await supabase
      .from("musteriler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId)) as unknown as Sayim;
    logKull("2 musteriler count cevabı", { data: mc, error: mc.error, count: mc.count });
  } catch (e) {
    console.error("[firmaKullanimOzet] 2 musteriler exception", e);
    throw e;
  }
  if (mc.error) {
    console.error("[firmaKullanimOzet] 2 musteriler hata", mc.error);
    throw mc.error;
  }

  let urunRow: Sayim;
  try {
    urunRow = (await supabase
      .from("urunler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId)) as unknown as Sayim;
    logKull("3 urunler count cevabı", {
      data: urunRow,
      error: urunRow.error,
      count: urunRow.count,
    });
  } catch (e) {
    console.error("[firmaKullanimOzet] 3 urunler count exception", e);
    throw e;
  }
  if (urunRow.error) {
    console.error("[firmaKullanimOzet] 3 urunler count hata", urunRow.error);
    throw urunRow.error;
  }

  let urunIdlerQ: IdList;
  try {
    urunIdlerQ = (await supabase
      .from("urunler")
      .select("id")
      .eq("firma_id", firmaId)) as unknown as IdList;
    logKull("4 urun id listesi cevabı", {
      satir: urunIdlerQ.data?.length,
      error: urunIdlerQ.error,
    });
  } catch (e) {
    console.error("[firmaKullanimOzet] 4 urun listesi exception", e);
    throw e;
  }
  if (urunIdlerQ.error) {
    console.error("[firmaKullanimOzet] 4 urun listesi hata", urunIdlerQ.error);
    throw urunIdlerQ.error;
  }

  const ids =
    (urunIdlerQ.data as { id: string }[] | null)?.map((r) => r.id) ?? [];
  if (ids.length === 0) {
    logKull("bitti (urun yok, varyant atlandı)", {});
    return {
      kategori: kc.count ?? 0,
      musteri: mc.count ?? 0,
      urun: urunRow.count ?? 0,
      varyant: 0,
      fotograf: 0,
    };
  }

  let vrows: Vry;
  try {
    vrows = (await supabase
      .from("varyantlar")
      .select("gorsel_url")
      .in("urun_id", ids)) as unknown as Vry;
    logKull("5 varyantlar .in(urun_id) cevabı", {
      say: vrows.data?.length,
      error: vrows.error,
      urun_id_sayisi: ids.length,
    });
  } catch (e) {
    console.error("[firmaKullanimOzet] 5 varyantlar exception", e);
    throw e;
  }
  if (vrows.error) {
    console.error("[firmaKullanimOzet] 5 varyantlar hata", vrows.error);
    throw vrows.error;
  }

  const rows = (vrows.data as { gorsel_url: string | null }[] | null) ?? [];
  const fotograf = rows.reduce(
    (s, r) => s + toplamFotografGorselUrl(r.gorsel_url),
    0,
  );
  logKull("bitti", { varyant: rows.length, fotograf });
  return {
    kategori: kc.count ?? 0,
    musteri: mc.count ?? 0,
    urun: urunRow.count ?? 0,
    varyant: rows.length,
    fotograf,
  };
}
