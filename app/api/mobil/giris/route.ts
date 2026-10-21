import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import { isFirmaSessionCookieValue } from "@/lib/firma-session";
import { createMobilToken } from "@/lib/mobil-token";

const FIRMA_SELECT =
  "id, firma_kodu, firma_adi, logo_url, slogan, max_urun, max_kategori, max_fotograf, max_musteri, aktif, created_at";
const MUSTERI_SELECT =
  "id, firma_id, musteri_kodu, musteri_adi, fiyat_listesi_id, aktif, created_at";
const KATEGORI_SELECT = "id, firma_id, kategori_adi, sira, ozel, aktif, created_at";

const GENEL_HATA = "Giriş yapılamadı.";
const MUSTERI_HATALI = "Firma kodu, müşteri kodu veya şifre hatalı.";
const ESNAF_HATALI = "Firma kodu veya şifre hatalı.";

/** Yanıtlarda asla dönmemesi gereken alanları (iç içe olsa bile) temizler. */
function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripSensitive(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "sifre" || k === "panel_sifre" || k === "api_key") continue;
      out[k] = stripSensitive(v);
    }
    return out as T;
  }
  return value;
}

/** Supabase hatasından sadece mesajı alır (şifre/hash asla loglanmaz). */
function supabaseErrMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return "bilinmeyen hata";
}

/** Esnaf girişinde adım logu: hangi adımda 401'e düşüldüğünü gösterir. */
function logEsnafAdim(adim: string, detay?: string) {
  console.error(`[api/mobil/giris esnaf] adim=${adim}${detay ? ` ${detay}` : ""}`);
}

const ESNAF_USAGE_VARSAYILAN = { urun: 0, kategori: 0, musteri: 0, fotograf: 0 };

/**
 * firma-login ile aynı çıkarma: string ise trim, skaler ise String(),
 * ayrıca mobildeki array/obje biçimlerini de kabul eder; sonuç UUID olmalı.
 */
function extractFirmaIdFromRpc(data: unknown): string | null {
  const direct =
    typeof data === "string"
      ? data.trim()
      : data != null && typeof data !== "object"
        ? String(data).trim()
        : "";
  const candidate = direct || parseFirmaIdFromVerifyFirmaPasswordRpc(data) || "";
  return isFirmaSessionCookieValue(candidate) ? candidate : null;
}

/** RPC `verify_firma_password` dönüşünden firma UUID çıkarır (string / array / obje biçimleri). */
function parseFirmaIdFromVerifyFirmaPasswordRpc(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") {
    const t = data.trim();
    return t.length > 0 ? t : null;
  }
  if (Array.isArray(data) && data.length > 0) {
    return parseFirmaIdFromVerifyFirmaPasswordRpc(data[0]);
  }
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    const id = o.firma_id ?? o.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function countGorselParcalari(raw: string | null | undefined): number {
  if (raw == null || !String(raw).trim()) return 0;
  return String(raw)
    .split(/[,|]/)
    .map((x) => x.trim())
    .filter(Boolean).length;
}

/** Mobil `fetchEsnafFirmaKullanim` karşılığı (service role ile). */
async function fetchEsnafKullanim(
  sb: ReturnType<typeof createFirmaServiceRoleClient>,
  firmaId: string,
) {
  const [uRes, kRes, mRes] = await Promise.all([
    sb.from("urunler").select("id", { count: "exact", head: true }).eq("firma_id", firmaId),
    sb.from("kategoriler").select("id", { count: "exact", head: true }).eq("firma_id", firmaId),
    sb.from("musteriler").select("id", { count: "exact", head: true }).eq("firma_id", firmaId),
  ]);
  if (uRes.error) throw uRes.error;
  if (kRes.error) throw kRes.error;
  if (mRes.error) throw mRes.error;

  const { data: urunRows, error: urErr } = await sb
    .from("urunler")
    .select("id")
    .eq("firma_id", firmaId);
  if (urErr) throw urErr;
  const ids = (urunRows ?? []).map((r) => r.id as string);
  let fotograf = 0;
  if (ids.length > 0) {
    const { data: vars, error: vErr } = await sb
      .from("varyantlar")
      .select("gorsel_url")
      .in("urun_id", ids);
    if (vErr) throw vErr;
    for (const row of vars ?? []) {
      fotograf += countGorselParcalari(row.gorsel_url as string | null);
    }
  }
  return {
    urun: uRes.count ?? 0,
    kategori: kRes.count ?? 0,
    musteri: mRes.count ?? 0,
    fotograf,
  };
}

type Body = {
  tip?: string;
  firma_kodu?: string;
  musteri_kodu?: string;
  sifre?: string;
};

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }

  const tip = String(body.tip ?? "").trim().toLowerCase();
  if (tip !== "musteri" && tip !== "esnaf") {
    return NextResponse.json({ ok: false, error: "Geçersiz tip." }, { status: 400 });
  }

  let sb: ReturnType<typeof createFirmaServiceRoleClient>;
  try {
    sb = createFirmaServiceRoleClient();
  } catch (e) {
    console.error("[api/mobil/giris] service role client", e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }

  try {
    if (tip === "musteri") {
      const fk = String(body.firma_kodu ?? "").trim();
      const mk = String(body.musteri_kodu ?? "").trim();
      const sifre = String(body.sifre ?? "");
      if (!fk || !mk || !sifre) {
        return NextResponse.json({ ok: false, error: MUSTERI_HATALI }, { status: 401 });
      }

      const { data: firma, error: firmaErr } = await sb
        .from("firmalar")
        .select(FIRMA_SELECT)
        .eq("firma_kodu", fk)
        .eq("aktif", true)
        .maybeSingle();
      if (firmaErr) throw firmaErr;
      if (!firma) {
        return NextResponse.json({ ok: false, error: MUSTERI_HATALI }, { status: 401 });
      }

      const { data: musteri, error: musteriErr } = await sb
        .from("musteriler")
        .select(MUSTERI_SELECT)
        .eq("firma_id", firma.id)
        .eq("musteri_kodu", mk)
        .eq("aktif", true)
        .maybeSingle();
      if (musteriErr) throw musteriErr;
      if (!musteri) {
        return NextResponse.json({ ok: false, error: MUSTERI_HATALI }, { status: 401 });
      }

      const { data: sifreDogru, error: verifyErr } = await sb.rpc("verify_password", {
        p_musteri_id: musteri.id,
        p_sifre: sifre,
      });
      if (verifyErr) throw verifyErr;
      if (sifreDogru !== true) {
        return NextResponse.json({ ok: false, error: MUSTERI_HATALI }, { status: 401 });
      }

      const { data: kategoriler, error: katErr } = await sb
        .from("kategoriler")
        .select(KATEGORI_SELECT)
        .eq("firma_id", firma.id)
        .eq("aktif", true)
        .order("sira", { ascending: true, nullsFirst: false });
      if (katErr) throw katErr;

      const token = createMobilToken({
        mode: "musteri",
        firma_id: String(firma.id),
        musteri_id: String(musteri.id),
      });

      return NextResponse.json(
        stripSensitive({
          ok: true,
          token,
          mode: "musteri",
          firma,
          musteri,
          kategoriler: kategoriler ?? [],
        }),
      );
    }

    // tip === "esnaf" — doğrulama firma-login ile aynı:
    // RPC (p_firma_kodu, p_sifre) -> uuid; firmalar sorgusunda aktif filtresi YOK
    // (RPC zaten coalesce(aktif, true) uygular; aktif=NULL satır elenmemeli).
    const fk = String(body.firma_kodu ?? "").trim();
    const sifre = String(body.sifre ?? "");
    if (!fk || !sifre) {
      logEsnafAdim("eksik_alan", "firma_kodu veya sifre bos");
      return NextResponse.json({ ok: false, error: ESNAF_HATALI }, { status: 401 });
    }

    const { data: rpcData, error: rpcErr } = await sb.rpc("verify_firma_password", {
      p_firma_kodu: fk,
      p_sifre: sifre,
    });
    if (rpcErr) {
      logEsnafAdim("rpc_hata", supabaseErrMsg(rpcErr));
      return NextResponse.json({ ok: false, error: ESNAF_HATALI }, { status: 401 });
    }

    const firmaId = extractFirmaIdFromRpc(rpcData);
    if (!firmaId) {
      logEsnafAdim(
        "rpc_sonuc_parse",
        `rpcData tipi=${rpcData === null ? "null" : Array.isArray(rpcData) ? "array" : typeof rpcData}`,
      );
      return NextResponse.json({ ok: false, error: ESNAF_HATALI }, { status: 401 });
    }

    const { data: firma, error: firmaErr } = await sb
      .from("firmalar")
      .select(FIRMA_SELECT)
      .eq("id", firmaId)
      .maybeSingle();
    if (firmaErr) {
      logEsnafAdim("firmalar_sorgusu_hata", supabaseErrMsg(firmaErr));
      return NextResponse.json({ ok: false, error: ESNAF_HATALI }, { status: 401 });
    }
    if (!firma) {
      logEsnafAdim("firma_bulunamadi", `firma_id=${firmaId}`);
      return NextResponse.json({ ok: false, error: ESNAF_HATALI }, { status: 401 });
    }

    // Kullanım/kota alınamazsa giriş reddedilmez; varsayılanlarla devam edilir.
    let usage = ESNAF_USAGE_VARSAYILAN;
    try {
      usage = await fetchEsnafKullanim(sb, String(firma.id));
    } catch (e) {
      logEsnafAdim("kullanim_alinamadi", supabaseErrMsg(e));
    }

    const token = createMobilToken({ mode: "esnaf", firma_id: String(firma.id) });

    return NextResponse.json(
      stripSensitive({
        ok: true,
        token,
        mode: "esnaf",
        firma,
        usage,
      }),
    );
  } catch (e) {
    console.error("[api/mobil/giris]", e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }
}
