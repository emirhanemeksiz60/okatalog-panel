import { supabase } from "@/lib/supabase";
import { toplamFotografGorselUrl } from "@/lib/admin-istatistik";

/** `get_firma_istatistik` RPC yanıtı */
type FirmaIstatistikJson = {
  urun_sayisi: number;
  musteri_sayisi: number;
  kategori_sayisi: number;
  varyant_sayisi: number;
  fotograf_toplam: number;
};

function parseFirmaIstatistik(data: unknown): FirmaIstatistikJson {
  const o = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    urun_sayisi: Number(o.urun_sayisi ?? 0),
    musteri_sayisi: Number(o.musteri_sayisi ?? 0),
    kategori_sayisi: Number(o.kategori_sayisi ?? 0),
    varyant_sayisi: Number(o.varyant_sayisi ?? 0),
    fotograf_toplam: Number(o.fotograf_toplam ?? 0),
  };
}

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

  const sonuclar = await Promise.all(
    firmaIdler.map(async (fid) => {
      const { data, error } = await supabase.rpc("get_firma_istatistik", {
        p_firma_id: fid,
      });
      if (error) throw error;
      return { fid, stats: parseFirmaIstatistik(data) };
    }),
  );

  for (const { fid, stats } of sonuclar) {
    if (!m.has(fid)) continue;
    m.set(fid, {
      firma_id: fid,
      urun: stats.urun_sayisi,
      musteri: stats.musteri_sayisi,
      fotograf: stats.fotograf_toplam,
    });
  }
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
