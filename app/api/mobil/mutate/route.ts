import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import { getMobilSession } from "@/lib/mobil-token";

const GENEL_HATA = "İşlem gerçekleştirilemedi.";

type Sb = ReturnType<typeof createFirmaServiceRoleClient>;

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function parseSiparisIdFromRpc(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data.trim();
  if (Array.isArray(data)) return data.length > 0 ? parseSiparisIdFromRpc(data[0]) : "";
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    const v = o.siparis_id ?? o.id;
    return typeof v === "string" ? v.trim() : "";
  }
  return "";
}

type CartLineInput = {
  urunId?: unknown;
  varyantId?: unknown;
  urunKodu?: unknown;
  barkod?: unknown;
  urunAdi?: unknown;
  renkAdi?: unknown;
  adet?: unknown;
  // snake_case kabulü (ileri uyumluluk)
  urun_id?: unknown;
  varyant_id?: unknown;
  urun_kodu?: unknown;
  urun_adi?: unknown;
  renk_adi?: unknown;
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

      const kalemler = rawLines.map((k) => ({
        urun_id: String(k.urunId ?? k.urun_id ?? ""),
        varyant_id: String(k.varyantId ?? k.varyant_id ?? ""),
        urun_kodu: String(k.urunKodu ?? k.urun_kodu ?? ""),
        barkod: (k.barkod as string | null) ?? null,
        urun_adi: String(k.urunAdi ?? k.urun_adi ?? ""),
        renk_adi: (k.renkAdi as string | null) ?? (k.renk_adi as string | null) ?? null,
        adet: Number(k.adet),
      }));
      if (kalemler.some((k) => !k.urun_id || !Number.isFinite(k.adet) || k.adet <= 0)) {
        return badRequest("Sepet satırları geçersiz.");
      }
      const notlarRaw = body.notlar;
      const notlar = typeof notlarRaw === "string" && notlarRaw.trim() ? notlarRaw.trim() : null;

      // firma_id / musteri_id HER ZAMAN token'dan
      const { data, error } = await sb.rpc("create_siparis_from_cart", {
        p_firma_id: firmaId,
        p_musteri_id: musteriId,
        p_notlar: notlar,
        p_kalemler: kalemler,
      });
      if (error) throw error;
      const siparisId = parseSiparisIdFromRpc(data);
      if (!siparisId) {
        console.error("[api/mobil/mutate siparis_olustur] RPC siparis_id donmedi", data);
        return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
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
