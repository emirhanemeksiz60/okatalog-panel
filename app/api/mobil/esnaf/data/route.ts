import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import { getMobilSession } from "@/lib/mobil-token";
import {
  fetchEsnafKullanim,
  kategoriFirmaKontrol,
  musteriFirmaKontrol,
  stripSensitive,
  urunFirmaKontrol,
  type Sb,
} from "@/lib/mobil-esnaf-yardim";

const URUNLER_LIST_COLUMNS =
  "id, firma_id, kategori_id, urun_kodu, urun_adi, detay, fiyat, para_birimi, barkod, yeni_mi, guncelleme, aktif, created_at, updated_at";
const KATEGORILER_LIST_COLUMNS = "id, firma_id, kategori_adi, sira, aktif, ozel, created_at";
const VARYANT_ESNAF_LIST_COLUMNS =
  "id, urun_id, renk_adi, renk_hex, gorsel_url, stok_durumu, stok_miktar, stok_birimi, min_siparis, created_at";
const MUSTERI_LIST_COLUMNS = "id, firma_id, musteri_kodu, musteri_adi, aktif, created_at";
const SIPARIS_ESNAF_LIST_COLUMNS =
  "id, firma_id, musteri_id, durum, toplam_urun, notlar, esnaf_notu, kargo_notu, created_at, updated_at, onaylandi_at, hazirlaniyor_at, gonderildi_at, reddedildi_at, musteriler(id, musteri_adi, musteri_kodu)";
const SIPARIS_KALEM_DETAY_COLUMNS =
  "id, siparis_id, urun_id, varyant_id, urun_kodu, urun_adi, renk_adi, adet, orijinal_adet, durum, birim_fiyat, toplam_fiyat";

const GENEL_HATA = "Veri alınamadı.";

function badRequest(message = "Geçersiz istek.") {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}
function notFound(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}

// ---------- esnaf-order yardımcıları (mobildeki karşılıkları) ----------

type MusteriEmbed = { id?: string; musteri_adi?: string | null; musteri_kodu?: string | null };
type SiparisRowEmbed = Record<string, unknown> & {
  musteriler?: MusteriEmbed | MusteriEmbed[] | null;
};

function musteriEmbedOne(m: SiparisRowEmbed["musteriler"]): MusteriEmbed | null {
  if (m == null) return null;
  return Array.isArray(m) ? (m[0] ?? null) : m;
}

function siparisRowToWithMusteri(raw: SiparisRowEmbed) {
  const m = musteriEmbedOne(raw.musteriler);
  const { musteriler: _omit, ...sip } = raw;
  const musteri_adi_goster =
    (m?.musteri_adi as string | null)?.trim() ||
    String(m?.musteri_kodu ?? "").trim() ||
    (typeof sip.musteri_id === "string" ? sip.musteri_id.slice(0, 8) : "") ||
    "—";
  return { ...sip, musteri_adi_goster };
}

function currencySymbol(code: string | null | undefined): string {
  const c = String(code ?? "TRY").toUpperCase();
  if (c === "USD") return "$";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  return "₺";
}
function fmtMoney(amount: number, currency: string | null | undefined): string {
  return `${currencySymbol(currency)}${amount.toFixed(2)}`;
}
function buildTutarOzet(
  siparisId: string,
  per: Map<string, Map<string, number>>,
): string {
  const totals = per.get(siparisId);
  if (!totals || totals.size === 0) return "Tutar: —";
  return `Tutar: ${[...totals.entries()].map(([c, a]) => fmtMoney(a, c)).join(" + ")}`;
}

async function buildSiparisCurrencyTotals(sb: Sb, firmaId: string, siparisIds: string[]) {
  const per = new Map<string, Map<string, number>>();
  if (siparisIds.length === 0) return per;
  const { data: kalemRows, error: kalErr } = await sb
    .from("siparis_kalemleri")
    .select("siparis_id, urun_id, adet, birim_fiyat, toplam_fiyat, durum")
    .in("siparis_id", siparisIds);
  if (kalErr) throw kalErr;

  const urunIds = [...new Set((kalemRows ?? []).map((k) => String(k.urun_id)).filter(Boolean))];
  const urunCurrencyMap = new Map<string, string>();
  if (urunIds.length > 0) {
    const { data: urunRows, error: urErr } = await sb
      .from("urunler")
      .select("id, para_birimi")
      .eq("firma_id", firmaId)
      .in("id", urunIds);
    if (urErr) throw urErr;
    for (const r of urunRows ?? []) {
      urunCurrencyMap.set(String(r.id), String(r.para_birimi ?? "TRY").toUpperCase());
    }
  }
  for (const row of kalemRows ?? []) {
    const durum = String(row.durum ?? "").toLowerCase();
    const adet = Number(row.adet ?? 0);
    if (durum === "kaldirildi" || adet <= 0) continue;
    const birim = row.birim_fiyat == null ? null : Number(row.birim_fiyat);
    const toplam =
      row.toplam_fiyat == null ? (birim == null ? null : birim * adet) : Number(row.toplam_fiyat);
    if (toplam == null || !Number.isFinite(toplam)) continue;
    const sipId = String(row.siparis_id);
    const currency = urunCurrencyMap.get(String(row.urun_id)) ?? "TRY";
    const curMap = per.get(sipId) ?? new Map<string, number>();
    curMap.set(currency, (curMap.get(currency) ?? 0) + toplam);
    per.set(sipId, curMap);
  }
  return per;
}

async function fetchSiparisListe(sb: Sb, firmaId: string, durumlar: string[]) {
  const { data, error } = await sb
    .from("siparisler")
    .select(SIPARIS_ESNAF_LIST_COLUMNS)
    .eq("firma_id", firmaId)
    .in("durum", durumlar)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as SiparisRowEmbed[];
  const totals = await buildSiparisCurrencyTotals(
    sb,
    firmaId,
    rows.map((r) => String(r.id)),
  );
  return rows.map((r) => {
    const withM = siparisRowToWithMusteri(r);
    return { ...withM, tutar_ozet: buildTutarOzet(String(r.id), totals) };
  });
}

// ---------- ai-kullanim parse (mobildeki karşılık) ----------

export type AiKullanimDurumu = { izin: boolean; kalan: number | null; limit: number };

function parseAiKullanimKontrol(data: unknown): AiKullanimDurumu | null {
  if (data === true) return { izin: true, kalan: null, limit: 5 };
  if (data === false) return { izin: false, kalan: 0, limit: 5 };
  const o =
    data != null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (!o) return null;
  const limit =
    typeof o.limit === "number"
      ? o.limit
      : typeof o.max === "number"
        ? o.max
        : typeof o.gunluk_limit === "number"
          ? o.gunluk_limit
          : 5;
  const kalan: number | null =
    typeof o.kalan === "number"
      ? o.kalan
      : typeof o.remaining === "number"
        ? o.remaining
        : typeof o.kalan_hak === "number"
          ? o.kalan_hak
          : typeof o.kullanilan === "number"
            ? Math.max(0, limit - o.kullanilan)
            : null;
  const izin =
    typeof o.izin === "boolean"
      ? o.izin
      : typeof o.allowed === "boolean"
        ? o.allowed
        : typeof o.kullanilabilir === "boolean"
          ? o.kullanilabilir
          : kalan != null
            ? kalan > 0
            : true;
  return { izin, kalan, limit };
}

// ---------- Route ----------

export async function GET(request: NextRequest) {
  const session = getMobilSession(request);
  if (!session || session.mode !== "esnaf") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const firmaId = session.firma_id;

  let sb: Sb;
  try {
    sb = createFirmaServiceRoleClient();
  } catch (e) {
    console.error("[api/mobil/esnaf/data] service role client", e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }

  const q = request.nextUrl.searchParams;
  const islem = String(q.get("islem") ?? "").trim().toLowerCase();
  const idParam = () => String(q.get("id") ?? "").trim();

  try {
    // esnaf-service: fetchEsnafFirmaKullanim
    if (islem === "kullanim") {
      const data = await fetchEsnafKullanim(sb, firmaId);
      return NextResponse.json({ ok: true, data, error: null });
    }

    // esnaf-service: fetchUrunlerEsnafList (kategori adı eşlemeli)
    if (islem === "urunler") {
      const { data: urunler, error: uErr } = await sb
        .from("urunler")
        .select(URUNLER_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .order("urun_kodu", { ascending: true });
      if (uErr) throw uErr;
      const { data: katlar, error: kErr } = await sb
        .from("kategoriler")
        .select(KATEGORILER_LIST_COLUMNS)
        .eq("firma_id", firmaId);
      if (kErr) throw kErr;
      const katMap = new Map(
        (katlar ?? []).map((k) => [String(k.id), (k.kategori_adi as string | null) ?? null]),
      );
      const data = ((urunler ?? []) as Record<string, unknown>[]).map((u) => ({
        ...u,
        kategori_adi: u.kategori_id ? (katMap.get(String(u.kategori_id)) ?? null) : null,
      }));
      return NextResponse.json(stripSensitive({ ok: true, data, error: null }));
    }

    // esnaf-service: fetchKategorilerEsnaf
    if (islem === "kategoriler") {
      const { data, error } = await sb
        .from("kategoriler")
        .select(KATEGORILER_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .order("sira", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data ?? [], error: null });
    }

    // esnaf-service: fetchKategorilerUrunFormu (aktif + özel olmayan)
    if (islem === "urun_formu_kategoriler") {
      const { data, error } = await sb
        .from("kategoriler")
        .select(KATEGORILER_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .order("sira", { ascending: true, nullsFirst: false });
      if (error) throw error;
      const isOzel = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
      const rows = ((data ?? []) as Record<string, unknown>[]).filter(
        (k) => k.aktif === true && !isOzel(k.ozel),
      );
      return NextResponse.json({ ok: true, data: rows, error: null });
    }

    // esnaf-service: fetchUrunByIdEsnaf
    if (islem === "urun_detay") {
      const urunId = String(q.get("urun_id") ?? idParam()).trim();
      if (!urunId) return badRequest("urun_id zorunlu.");
      const { data, error } = await sb
        .from("urunler")
        .select(URUNLER_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .eq("id", urunId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return notFound("Ürün bulunamadı.");
      return NextResponse.json(stripSensitive({ ok: true, data, error: null }));
    }

    // esnaf-service: fetchVaryantlarEsnaf
    if (islem === "varyantlar") {
      const urunId = String(q.get("urun_id") ?? idParam()).trim();
      if (!urunId) return badRequest("urun_id zorunlu.");
      if (!(await urunFirmaKontrol(sb, firmaId, urunId))) return notFound("Ürün bulunamadı.");
      const { data, error } = await sb
        .from("varyantlar")
        .select(VARYANT_ESNAF_LIST_COLUMNS)
        .eq("urun_id", urunId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, data: data ?? [], error: null });
    }

    // esnaf-service: fetchMusterilerEsnaf (sifre dönmez)
    if (islem === "musteriler") {
      const { data, error } = await sb
        .from("musteriler")
        .select(MUSTERI_LIST_COLUMNS)
        .eq("firma_id", firmaId)
        .order("musteri_kodu", { ascending: true });
      if (error) throw error;
      return NextResponse.json(stripSensitive({ ok: true, data: data ?? [], error: null }));
    }

    // esnaf-order: countSiparisIstekleri
    if (islem === "siparis_bekleyen_sayi") {
      const { count, error } = await sb
        .from("siparisler")
        .select("id", { count: "exact", head: true })
        .eq("firma_id", firmaId)
        .in("durum", ["istek", "duzenlendi"]);
      if (error) throw error;
      return NextResponse.json({ ok: true, count: count ?? 0, error: null });
    }

    // esnaf-order: fetchSiparisIstekleriEsnaf
    if (islem === "siparis_istekleri") {
      const data = await fetchSiparisListe(sb, firmaId, ["istek", "duzenlendi"]);
      return NextResponse.json(stripSensitive({ ok: true, data, error: null }));
    }

    // esnaf-order: fetchSiparisOnayliListeEsnaf
    if (islem === "siparis_onayli_liste") {
      const data = await fetchSiparisListe(sb, firmaId, [
        "onaylandi",
        "hazirlaniyor",
        "gonderildi",
      ]);
      return NextResponse.json(stripSensitive({ ok: true, data, error: null }));
    }

    // esnaf-order: fetchSiparisDetayEsnaf
    if (islem === "siparis_detay") {
      const siparisId = String(q.get("siparis_id") ?? idParam()).trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");
      const { data: sipRaw, error: sErr } = await sb
        .from("siparisler")
        .select(SIPARIS_ESNAF_LIST_COLUMNS)
        .eq("id", siparisId)
        .eq("firma_id", firmaId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!sipRaw) return notFound("Sipariş bulunamadı.");

      const sipEmb = sipRaw as SiparisRowEmbed;
      const { musteriler: _mEmb, ...siparisRow } = sipEmb;
      const mOne = musteriEmbedOne(sipEmb.musteriler);
      const ad =
        (mOne?.musteri_adi as string | null)?.trim() ||
        String(mOne?.musteri_kodu ?? "").trim() ||
        "—";

      const [kalRes, karRes, gecRes] = await Promise.all([
        sb
          .from("siparis_kalemleri")
          .select(SIPARIS_KALEM_DETAY_COLUMNS)
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

      const kalemlerRaw = (kalRes.data ?? []) as Record<string, unknown>[];
      const urunIds = [...new Set(kalemlerRaw.map((k) => k.urun_id).filter(Boolean))];
      const urunCurrencyMap = new Map<string, string>();
      if (urunIds.length > 0) {
        const { data: urunRows, error: urErr } = await sb
          .from("urunler")
          .select("id, para_birimi")
          .eq("firma_id", firmaId)
          .in("id", urunIds as string[]);
        if (urErr) throw urErr;
        for (const u of urunRows ?? []) {
          urunCurrencyMap.set(String(u.id), String(u.para_birimi ?? "TRY").toUpperCase());
        }
      }
      const kalemler = kalemlerRaw.map((k) => ({
        ...k,
        para_birimi: urunCurrencyMap.get(String(k.urun_id)) ?? "TRY",
      }));

      // Mobil SiparisRow.notlar — müşteri notu; kolon SELECT'te var, açıkça koru
      const siparis = {
        ...siparisRow,
        notlar:
          siparisRow.notlar == null || siparisRow.notlar === ""
            ? null
            : String(siparisRow.notlar),
        esnaf_notu:
          siparisRow.esnaf_notu == null || siparisRow.esnaf_notu === ""
            ? null
            : String(siparisRow.esnaf_notu),
      };

      return NextResponse.json(
        stripSensitive({
          ok: true,
          data: {
            siparis,
            kalemler,
            kargoGorselleri: karRes.data ?? [],
            gecmis: gecRes.data ?? [],
            musteri_adi_goster: ad,
            // Eski/yanlış istemci yolu için üst düzey yansıma (siparis.notlar asıl kaynak)
            notlar: siparis.notlar,
          },
          error: null,
        }),
      );
    }

    // esnaf-order: fetchMusteriPushTokens (sadece token değerleri)
    if (islem === "musteri_push_tokenlari") {
      const musteriId = String(q.get("musteri_id") ?? idParam()).trim();
      if (!musteriId) return badRequest("musteri_id zorunlu.");
      if (!(await musteriFirmaKontrol(sb, firmaId, musteriId))) {
        return notFound("Müşteri bulunamadı.");
      }
      const { data, error } = await sb
        .from("push_tokens")
        .select("token")
        .eq("musteri_id", musteriId);
      if (error) throw error;
      const tokens = (data ?? [])
        .map((r) => String((r as { token?: unknown }).token ?? "").trim())
        .filter((t) => t.length > 0);
      return NextResponse.json({ ok: true, data: tokens, error: null });
    }

    // ai-kullanim: rpcAiKullanimKontrol
    if (islem === "ai_kullanim_kontrol") {
      const { data, error } = await sb.rpc("ai_kullanim_kontrol", { firma_id: firmaId });
      if (error) throw error;
      const durum = parseAiKullanimKontrol(data);
      if (!durum) {
        console.error("[api/mobil/esnaf/data ai_kullanim_kontrol] okunamayan yanit", data);
        return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
      }
      return NextResponse.json({ ok: true, durum, error: null });
    }

    return badRequest(`Geçersiz islem: ${islem || "(boş)"}.`);
  } catch (e) {
    console.error(`[api/mobil/esnaf/data ${islem || "?"}]`, e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }
}
