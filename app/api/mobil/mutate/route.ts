import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import { getMobilSession } from "@/lib/mobil-token";

const GENEL_HATA = "İşlem gerçekleştirilemedi.";

type Sb = ReturnType<typeof createFirmaServiceRoleClient>;

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

/** Eski doğrudan insert sürümündeki gibi: "default"/boş varyant DB'ye null yazılır */
function resolveVaryantIdForDb(varyantId: string): string | null {
  const v = varyantId.trim();
  if (!v || v === "default") return null;
  return v;
}

type CartLineInput = {
  urunId?: unknown;
  varyantId?: unknown;
  urunKodu?: unknown;
  urunAdi?: unknown;
  renkAdi?: unknown;
  adet?: unknown;
  birimFiyat?: unknown;
  // snake_case kabulü (ileri uyumluluk)
  urun_id?: unknown;
  varyant_id?: unknown;
  urun_kodu?: unknown;
  urun_adi?: unknown;
  renk_adi?: unknown;
  birim_fiyat?: unknown;
};

export async function POST(request: NextRequest) {
  const session = getMobilSession(request);
  if (!session || session.mode !== "musteri" || !session.musteri_id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const firmaId = session.firma_id;
  const musteriId = session.musteri_id;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }

  const islem = String(body.islem ?? "").trim().toLowerCase();

  let sb: Sb;
  try {
    sb = createFirmaServiceRoleClient();
  } catch (e) {
    console.error("[api/mobil/mutate] service role client", e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }

  try {
    // Gecmis / gorunen ad icin musteri (token'daki musteri_id ile)
    const { data: musteri, error: mErr } = await sb
      .from("musteriler")
      .select("id, musteri_kodu, musteri_adi")
      .eq("id", musteriId)
      .eq("firma_id", firmaId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!musteri) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const musteriDisplayName =
      String(musteri.musteri_adi ?? "").trim() || String(musteri.musteri_kodu ?? "");

    // ---- order-service: createSiparisFromCart
    if (islem === "siparis_olustur") {
      const rawLines = (Array.isArray(body.lines)
        ? body.lines
        : Array.isArray(body.kalemler)
          ? body.kalemler
          : []) as CartLineInput[];
      if (rawLines.length === 0) return badRequest("Sepet boş.");

      // siparis_kalemleri'nde "barkod" kolonu YOK — eski doğrudan insert
      // sürümündeki (RPC öncesi) kolon listesi birebir kullanılır.
      const kalemler = rawLines.map((k) => {
        const adet = Number(k.adet);
        const birimRaw = k.birimFiyat ?? k.birim_fiyat;
        const birimFiyat =
          birimRaw == null || birimRaw === "" ? null : Number.isFinite(Number(birimRaw)) ? Number(birimRaw) : null;
        return {
          urun_id: String(k.urunId ?? k.urun_id ?? ""),
          varyant_id: resolveVaryantIdForDb(String(k.varyantId ?? k.varyant_id ?? "")),
          urun_kodu: String(k.urunKodu ?? k.urun_kodu ?? ""),
          urun_adi: String(k.urunAdi ?? k.urun_adi ?? ""),
          renk_adi: (k.renkAdi as string | null) ?? (k.renk_adi as string | null) ?? null,
          adet,
          birim_fiyat: birimFiyat,
          toplam_fiyat: birimFiyat == null ? null : birimFiyat * adet,
          orijinal_adet: adet,
        };
      });
      if (kalemler.some((k) => !k.urun_id || !Number.isFinite(k.adet) || k.adet <= 0)) {
        return badRequest("Sepet satırları geçersiz.");
      }
      // Mobil order-service: { islem, notlar, lines } — alternatif adlar da kabul
      const notlarCandidate = body.notlar ?? body.not ?? body.note ?? body.musteri_notu;
      const notlar =
        typeof notlarCandidate === "string" && notlarCandidate.trim()
          ? notlarCandidate.trim()
          : null;

      // firma_id / musteri_id HER ZAMAN token'dan
      // 1) Sipariş başlığı
      const toplam = kalemler.reduce((s, k) => s + k.adet, 0);
      const { data: sip, error: sipErr } = await sb
        .from("siparisler")
        .insert({
          firma_id: firmaId,
          musteri_id: musteriId,
          durum: "istek",
          toplam_urun: toplam,
          notlar,
          esnaf_notu: null,
          kargo_notu: null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();
      if (sipErr) throw sipErr;
      const siparisId = sip?.id ? String(sip.id) : "";
      if (!siparisId) {
        return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
      }

      // 2) Kalemler — hata olursa başlık silinir (yarım sipariş kalmaz)
      const kalemRows = kalemler.map((k) => ({
        siparis_id: siparisId,
        urun_id: k.urun_id,
        varyant_id: k.varyant_id,
        urun_kodu: k.urun_kodu,
        urun_adi: k.urun_adi,
        renk_adi: k.renk_adi,
        adet: k.adet,
        birim_fiyat: k.birim_fiyat,
        toplam_fiyat: k.toplam_fiyat,
        orijinal_adet: k.orijinal_adet,
        durum: "istek",
      }));
      const { error: kalErr } = await sb.from("siparis_kalemleri").insert(kalemRows);
      if (kalErr) {
        const { error: delErr } = await sb
          .from("siparisler")
          .delete()
          .eq("id", siparisId)
          .eq("firma_id", firmaId)
          .eq("musteri_id", musteriId);
        if (delErr) {
          console.error("[api/mobil/mutate siparis_olustur baslik_sil]", delErr);
        }
        throw kalErr;
      }

      const { error: gecErr } = await sb.from("siparis_gecmisi").insert({
        siparis_id: siparisId,
        onceki_durum: null,
        yeni_durum: "istek",
        degistiren: musteriDisplayName,
        not_text: null,
      });
      if (gecErr) {
        // Mobildeki gibi: gecmis yazilamasa da siparis olusmus sayilir, sadece logla
        console.error("[api/mobil/mutate siparis_olustur siparis_gecmisi]", gecErr);
      }

      return NextResponse.json({ ok: true, siparisId, error: null });
    }

    // ---- order-service: musteriOnaylaDuzenlenenSiparis
    if (islem === "duzenlenen_siparisi_onayla") {
      const siparisId = String(body.siparis_id ?? body.siparisId ?? body.id ?? "").trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");

      const { data: cur, error: readErr } = await sb
        .from("siparisler")
        .select("id, durum")
        .eq("id", siparisId)
        .eq("firma_id", firmaId)
        .eq("musteri_id", musteriId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!cur) {
        return NextResponse.json({ ok: false, error: "Sipariş bulunamadı." }, { status: 404 });
      }
      if (String(cur.durum) !== "duzenlendi") {
        return badRequest("Bu sipariş onaylanamaz.");
      }

      const now = new Date().toISOString();
      const { error: upErr } = await sb
        .from("siparisler")
        .update({ durum: "onaylandi", onaylandi_at: now, updated_at: now })
        .eq("id", siparisId)
        .eq("firma_id", firmaId)
        .eq("musteri_id", musteriId);
      if (upErr) throw upErr;

      const { error: gErr } = await sb.from("siparis_gecmisi").insert({
        siparis_id: siparisId,
        onceki_durum: "duzenlendi",
        yeni_durum: "onaylandi",
        degistiren: musteriDisplayName,
        not_text: null,
      });
      if (gErr) {
        console.error("[api/mobil/mutate duzenlenen_siparisi_onayla siparis_gecmisi]", gErr);
      }

      return NextResponse.json({ ok: true, error: null });
    }

    return badRequest(`Geçersiz islem: ${islem || "(boş)"}.`);
  } catch (e) {
    console.error(`[api/mobil/mutate ${islem || "?"}]`, e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }
}
