import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import { getMobilSession } from "@/lib/mobil-token";

const URUNLER_LIST_COLUMNS =
  "id, firma_id, kategori_id, urun_kodu, urun_adi, detay, fiyat, para_birimi, barkod, yeni_mi, guncelleme, aktif, created_at, updated_at";
const VARYANT_LIST_COLUMNS =
  "id, urun_id, renk_adi, renk_hex, gorsel_url, stok_durumu, stok_miktar, stok_birimi, min_siparis";
const KATEGORI_SELECT = "id, firma_id, kategori_adi, sira, ozel, aktif, created_at";
const SIPARIS_LIST_COLUMNS =
  "id, firma_id, musteri_id, durum, toplam_urun, notlar, esnaf_notu, kargo_notu, created_at, updated_at, onaylandi_at, hazirlaniyor_at, gonderildi_at, reddedildi_at";
const SIPARIS_KALEM_COLUMNS =
  "id, siparis_id, urun_id, varyant_id, urun_kodu, barkod, urun_adi, renk_adi, adet, orijinal_adet, durum, birim_fiyat, toplam_fiyat";

const GENEL_HATA = "Veri alınamadı.";

type Sb = ReturnType<typeof createFirmaServiceRoleClient>;

function serverError(scope: string, e: unknown) {
  console.error(`[api/mobil/data ${scope}]`, e);
  return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
}

function badRequest(message = "Geçersiz istek.") {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function notFound(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

function parseLimitOffset(q: URLSearchParams) {
  const limitRaw = Number.parseInt(q.get("limit") ?? "", 10);
  const offsetRaw = Number.parseInt(q.get("offset") ?? "", 10);
  return {
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 50,
    offset: Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0,
  };
}

type SearchUrunlerRpcRow = {
  urun_id: string;
  urun_kodu: string;
  urun_adi: string;
  barkod: string | null;
  kategori_id: string | null;
  fiyat: number | string | null;
  para_birimi: string | null;
};

/** Mobil `mapSearchUrunRpcRowToUrunRow` karşılığı */
function mapSearchRow(row: SearchUrunlerRpcRow, firmaId: string) {
  const rawFiyat = row.fiyat;
  const fiyat =
    rawFiyat == null || rawFiyat === ""
      ? null
      : typeof rawFiyat === "number"
        ? rawFiyat
        : Number(rawFiyat);
  return {
    id: String(row.urun_id),
    firma_id: firmaId,
    kategori_id: row.kategori_id,
    urun_kodu: String(row.urun_kodu ?? ""),
    barkod: row.barkod,
    urun_adi: String(row.urun_adi ?? ""),
    detay: null,
    fiyat: fiyat != null && Number.isFinite(fiyat) ? fiyat : null,
    para_birimi: row.para_birimi,
    yeni_mi: null,
    guncelleme: null,
    aktif: true,
    created_at: null,
    updated_at: null,
  };
}

function keyForUrunKodu(code: string | null | undefined): string {
  return String(code ?? "").trim().toUpperCase();
}

type ResolvedPrice = { fiyat: number | null; paraBirimi: string | null };

/** Mobil `resolveMusteriPriceMap` mantığı; urun kodları için varsayılanlar DB'den alınır. */
async function resolvePriceMap(
  sb: Sb,
  firmaId: string,
  musteriId: string,
  musteriFiyatListesiId: string | null,
  urunKodlari: string[] | null,
): Promise<Record<string, ResolvedPrice>> {
  const { data: urunRows, error: uErr } = await sb
    .from("urunler")
    .select("urun_kodu, fiyat, para_birimi")
    .eq("firma_id", firmaId);
  if (uErr) throw uErr;

  const wanted = urunKodlari ? new Set(urunKodlari.map(keyForUrunKodu)) : null;
  const defaults = new Map<string, ResolvedPrice>();
  for (const u of urunRows ?? []) {
    const key = keyForUrunKodu(u.urun_kodu as string);
    if (!key) continue;
    if (wanted && !wanted.has(key)) continue;
    defaults.set(key, {
      fiyat: (u.fiyat as number | null) ?? null,
      paraBirimi: (u.para_birimi as string | null) ?? "TRY",
    });
  }
  const out: Record<string, ResolvedPrice> = {};
  if (defaults.size === 0 && (urunKodlari?.length ?? 0) === 0) return out;

  // 1) Özel liste
  const { data: ozelListe, error: ozelErr } = await sb
    .from("fiyat_listeleri")
    .select("id, para_birimi, created_at")
    .eq("firma_id", firmaId)
    .eq("ozel_musteri_id", musteriId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ozelErr) throw ozelErr;

  // 2) Müşteriye atanmış genel liste
  const generalListeId = musteriFiyatListesiId;
  let generalCurrency: string | null = null;
  if (!ozelListe?.id && generalListeId) {
    const { data: generalListe, error: generalErr } = await sb
      .from("fiyat_listeleri")
      .select("id, para_birimi")
      .eq("id", generalListeId)
      .eq("firma_id", firmaId)
      .maybeSingle();
    if (generalErr) throw generalErr;
    generalCurrency =
      (generalListe?.para_birimi as string | null | undefined)?.trim()?.toUpperCase() ?? null;
  }

  const selectedListeId = (ozelListe?.id as string | undefined) ?? generalListeId;
  const selectedCurrency =
    (ozelListe?.para_birimi as string | null | undefined)?.trim()?.toUpperCase() ??
    generalCurrency;

  if (selectedListeId) {
    const { data: kalemler, error: kalemErr } = await sb
      .from("fiyat_liste_kalemleri")
      .select("urun_kodu, fiyat")
      .eq("firma_id", firmaId)
      .eq("liste_id", selectedListeId);
    if (kalemErr) throw kalemErr;
    for (const row of kalemler ?? []) {
      const key = keyForUrunKodu(row.urun_kodu as string | null | undefined);
      const fiyat = Number(row.fiyat);
      if (!key || !Number.isFinite(fiyat)) continue;
      // Yalnız istenen ürünler istenmişse map'i onlarla sınırla; aksi halde mobildeki
      // gibi tüm kalemler map'e girer, ardından varsayılanlar eksikleri tamamlar.
      if (wanted && !wanted.has(key)) continue;
      out[key] = { fiyat, paraBirimi: selectedCurrency ?? "TRY" };
    }
  }

  // 3) Liste kalemi yoksa ürün varsayılanına düş
  for (const [key, def] of defaults.entries()) {
    if (!out[key]) out[key] = def;
  }
  return out;
}

/** Müşterinin seçili fiyat listesini (özel > atanmış) ve kalemlerini döndürür. */
async function fetchSeciliFiyatListesi(
  sb: Sb,
  firmaId: string,
  musteriId: string,
  musteriFiyatListesiId: string | null,
) {
  const { data: ozelListe, error: ozelErr } = await sb
    .from("fiyat_listeleri")
    .select("id, para_birimi, created_at")
    .eq("firma_id", firmaId)
    .eq("ozel_musteri_id", musteriId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ozelErr) throw ozelErr;

  let liste: { id: string; para_birimi: string | null } | null = ozelListe
    ? {
        id: String(ozelListe.id),
        para_birimi: (ozelListe.para_birimi as string | null) ?? null,
      }
    : null;

  if (!liste && musteriFiyatListesiId) {
    const { data: generalListe, error: generalErr } = await sb
      .from("fiyat_listeleri")
      .select("id, para_birimi")
      .eq("id", musteriFiyatListesiId)
      .eq("firma_id", firmaId)
      .maybeSingle();
    if (generalErr) throw generalErr;
    if (generalListe) {
      liste = {
        id: String(generalListe.id),
        para_birimi: (generalListe.para_birimi as string | null) ?? null,
      };
    }
  }

  if (!liste) return { liste: null, kalemler: [] as Record<string, unknown>[] };

  const { data: kalemler, error: kalemErr } = await sb
    .from("fiyat_liste_kalemleri")
    .select("urun_kodu, fiyat")
    .eq("firma_id", firmaId)
    .eq("liste_id", liste.id);
  if (kalemErr) throw kalemErr;
  return { liste, kalemler: (kalemler ?? []) as Record<string, unknown>[] };
}

async function fetchMusteriRow(sb: Sb, firmaId: string, musteriId: string) {
  const { data, error } = await sb
    .from("musteriler")
    .select("id, firma_id, musteri_kodu, musteri_adi, fiyat_listesi_id, aktif, created_at")
    .eq("id", musteriId)
    .eq("firma_id", firmaId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest) {
  const session = getMobilSession(request);
  if (!session || session.mode !== "musteri" || !session.musteri_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const firmaId = session.firma_id;
  const musteriId = session.musteri_id;

  let sb: Sb;
  try {
    sb = createFirmaServiceRoleClient();
  } catch (e) {
    console.error("[api/mobil/data] service role client", e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }

  const q = request.nextUrl.searchParams;
  const islem = String(q.get("islem") ?? "").trim().toLowerCase();

  try {
    // ---- catalog-service: kategoriler yenileme (fetchKategorilerForFirma)
    if (islem === "kategoriler") {
      const { data, error } = await sb
        .from("kategoriler")
        .select(KATEGORI_SELECT)
        .eq("firma_id", firmaId)
        .eq("aktif", true)
        .order("sira", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data ?? [], error: null });
    }

    // ---- catalog-service: kategori ürünleri (fetchUrunlerForKategori)
    if (islem === "kategori_urunleri") {
      const kategoriId = String(q.get("kategori_id") ?? "").trim();
      const ozelRaw = String(q.get("ozel") ?? "").trim().toLowerCase();
      const ozel = ozelRaw === "1" || ozelRaw === "true";
      if (!kategoriId) return badRequest("kategori_id zorunlu.");

      const { data, error } = await sb
        .from("urunler")
        .select(URUNLER_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .eq("aktif", true)
        .order("urun_kodu", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      const filtered = ozel
        ? rows.filter(
            (u) =>
              u.yeni_mi === true ||
              (u.guncelleme != null && String(u.guncelleme).trim() !== ""),
          )
        : rows.filter((u) => u.kategori_id === kategoriId);
      return NextResponse.json({ ok: true, data: filtered, error: null });
    }

    // ---- catalog-service: firma geneli ürün arama (search_urunler_by_firma)
    if (islem === "urun_ara_firma") {
      const term = String(q.get("q") ?? "").trim();
      if (term.length < 2) return NextResponse.json({ ok: true, data: [], error: null });
      const { limit, offset } = parseLimitOffset(q);
      const { data, error } = await sb.rpc("search_urunler_by_firma", {
        p_firma_id: firmaId,
        p_term: term,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      const rows = (data ?? []) as SearchUrunlerRpcRow[];
      return NextResponse.json({
        ok: true,
        data: rows.map((r) => mapSearchRow(r, firmaId)),
        error: null,
      });
    }

    // ---- catalog-service: kategori içi ürün arama (search_urunler_by_kategori)
    if (islem === "urun_ara_kategori") {
      const kategoriId = String(q.get("kategori_id") ?? "").trim();
      if (!kategoriId) return badRequest("kategori_id zorunlu.");
      const term = String(q.get("q") ?? "").trim();
      if (term.length < 2) return NextResponse.json({ ok: true, data: [], error: null });
      const { limit, offset } = parseLimitOffset(q);
      const { data, error } = await sb.rpc("search_urunler_by_kategori", {
        p_firma_id: firmaId,
        p_kategori_id: kategoriId,
        p_term: term,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw error;
      const rows = (data ?? []) as SearchUrunlerRpcRow[];
      return NextResponse.json({
        ok: true,
        data: rows.map((r) => mapSearchRow(r, firmaId)),
        error: null,
      });
    }

    // ---- catalog-service: ürün detay (fetchUrunById)
    if (islem === "urun_detay") {
      const urunId = String(q.get("urun_id") ?? q.get("id") ?? "").trim();
      if (!urunId) return badRequest("urun_id zorunlu.");
      const { data, error } = await sb
        .from("urunler")
        .select(URUNLER_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .eq("id", urunId)
        .eq("aktif", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return notFound("Ürün bulunamadı.");
      return NextResponse.json({ ok: true, data, error: null });
    }

    // ---- catalog-service: varyantlar (fetchVaryantlarForUrun)
    if (islem === "varyantlar") {
      const urunId = String(q.get("urun_id") ?? q.get("id") ?? "").trim();
      if (!urunId) return badRequest("urun_id zorunlu.");
      const { data: urun, error: uErr } = await sb
        .from("urunler")
        .select("id")
        .eq("id", urunId)
        .eq("firma_id", firmaId)
        .eq("aktif", true)
        .maybeSingle();
      if (uErr) throw uErr;
      if (!urun) return notFound("Ürün bulunamadı.");
      const { data, error } = await sb
        .from("varyantlar")
        .select(VARYANT_LIST_COLUMNS)
        .eq("urun_id", urunId)
        .order("id", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data ?? [], error: null });
    }

    // ---- catalog-service: ilk görseller (fetchIlkGorselPerUrun)
    if (islem === "ilk_gorseller") {
      const rawList = [
        ...(q.get("urun_ids") ?? "").split(","),
        ...q.getAll("urun_id"),
      ]
        .map((s) => s.trim())
        .filter(Boolean);
      const urunIds = [...new Set(rawList)];
      if (urunIds.length === 0) return NextResponse.json({ ok: true, map: {}, error: null });

      // Yalnız bu firmanın ürünleri (firma_id filtresi zorunlu)
      const { data: owned, error: oErr } = await sb
        .from("urunler")
        .select("id")
        .eq("firma_id", firmaId)
        .in("id", urunIds);
      if (oErr) throw oErr;
      const ownedIds = ((owned ?? []) as { id: string }[]).map((r) => String(r.id));
      if (ownedIds.length === 0) return NextResponse.json({ ok: true, map: {}, error: null });

      const { data, error } = await sb
        .from("varyantlar")
        .select("id, urun_id, gorsel_url")
        .in("urun_id", ownedIds)
        .order("id", { ascending: true });
      if (error) throw error;

      const map: Record<string, string | null> = {};
      for (const row of data ?? []) {
        const uid = row.urun_id as string;
        const raw = row.gorsel_url as string | null | undefined;
        if (map[uid]) continue;
        const trimmed = raw != null ? String(raw).trim() : "";
        if (trimmed.length > 0) map[uid] = trimmed;
      }
      return NextResponse.json({ ok: true, map, error: null });
    }

    // ---- musteri-fiyat: get_musteri_fiyat RPC
    if (islem === "musteri_fiyat") {
      const urunKodu = String(q.get("urun_kodu") ?? "").trim();
      if (!urunKodu) return badRequest("urun_kodu zorunlu.");
      const { data, error } = await sb.rpc("get_musteri_fiyat", {
        p_musteri_id: musteriId,
        p_urun_kodu: urunKodu,
      });
      if (error) throw error;
      const n = data == null ? null : Number(data);
      return NextResponse.json({
        ok: true,
        data: Number.isFinite(n) ? n : null,
        error: null,
      });
    }

    // ---- musteri-fiyat: fiyat haritası (resolveMusteriPriceMap)
    if (islem === "musteri_fiyat_harita") {
      const musteri = await fetchMusteriRow(sb, firmaId, musteriId);
      if (!musteri) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const kodRaw = (q.get("urun_kodlari") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const map = await resolvePriceMap(
        sb,
        firmaId,
        musteriId,
        (musteri.fiyat_listesi_id as string | null) ?? null,
        kodRaw.length > 0 ? kodRaw : null,
      );
      return NextResponse.json({ ok: true, map, error: null });
    }

    // ---- musteri-fiyat: seçili fiyat listesi + fiyat_liste_kalemleri
    if (islem === "fiyat_liste_kalemleri") {
      const musteri = await fetchMusteriRow(sb, firmaId, musteriId);
      if (!musteri) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      const { liste, kalemler } = await fetchSeciliFiyatListesi(
        sb,
        firmaId,
        musteriId,
        (musteri.fiyat_listesi_id as string | null) ?? null,
      );
      return NextResponse.json({ ok: true, data: kalemler, liste, error: null });
    }

    // ---- order-service: müşterinin sipariş listesi (fetchSiparislerForMusteri)
    if (islem === "siparisler") {
      const { data, error } = await sb
        .from("siparisler")
        .select(SIPARIS_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .eq("musteri_id", musteriId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data ?? [], error: null });
    }

    // ---- order-service: sipariş detay (fetchSiparisDetay)
    if (islem === "siparis_detay") {
      const siparisId = String(q.get("siparis_id") ?? q.get("id") ?? "").trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");

      const { data: sip, error: sErr } = await sb
        .from("siparisler")
        .select(SIPARIS_LIST_COLUMNS)
        .eq("id", siparisId)
        .eq("firma_id", firmaId)
        .eq("musteri_id", musteriId)
        .maybeSingle();
      if (sErr) throw sErr;
      // Sipariş yoksa veya başka müşteriye aitse 404 (sızıntı yok)
      if (!sip) return notFound("Sipariş bulunamadı.");

      const [kalRes, karRes, gecRes] = await Promise.all([
        sb
          .from("siparis_kalemleri")
          .select(SIPARIS_KALEM_COLUMNS)
          .eq("siparis_id", siparisId)
          .order("id", { ascending: true }),
        sb
          .from("kargo_gorselleri")
          .select("id, siparis_id, gorsel_url, created_at")
          .eq("siparis_id", siparisId),
        sb
          .from("siparis_gecmisi")
          .select("id, siparis_id, onceki_durum, yeni_durum, degistiren, not_text, created_at")
          .eq("siparis_id", siparisId)
          .order("created_at", { ascending: true }),
      ]);
      if (kalRes.error) throw kalRes.error;
      if (karRes.error) throw karRes.error;
      if (gecRes.error) throw gecRes.error;

      const kalemler = (kalRes.data ?? []) as Record<string, unknown>[];
      // Barkod tamamlama (yalnız bu firmanın ürünlerinden)
      const urunIds = [...new Set(kalemler.map((k) => k.urun_id).filter(Boolean))];
      const barkodMap = new Map<string, string | null>();
      if (urunIds.length > 0) {
        const { data: urunRows, error: urErr } = await sb
          .from("urunler")
          .select("id, barkod")
          .eq("firma_id", firmaId)
          .in("id", urunIds as string[]);
        if (urErr) throw urErr;
        for (const r of urunRows ?? []) {
          barkodMap.set(String(r.id), (r.barkod as string | null) ?? null);
        }
      }

      return NextResponse.json({
        ok: true,
        data: {
          siparis: sip,
          kalemler: kalemler.map((k) => ({
            ...k,
            barkod: barkodMap.get(String(k.urun_id)) ?? null,
          })),
          kargoGorselleri: karRes.data ?? [],
          gecmis: gecRes.data ?? [],
        },
        error: null,
      });
    }

    // ---- order-service: firmanın push token'ları (sadece token değerleri)
    if (islem === "firma_push_tokenlari") {
      const { data, error } = await sb
        .from("push_tokens")
        .select("token")
        .eq("firma_id", firmaId);
      if (error) throw error;
      const tokens = (data ?? [])
        .map((r) => String((r as { token?: unknown }).token ?? "").trim())
        .filter((t) => t.length > 0);
      return NextResponse.json({ ok: true, data: tokens, error: null });
    }

    return badRequest(`Geçersiz islem: ${islem || "(boş)"}.`);
  } catch (e) {
    return serverError(islem || "?", e);
  }
}
