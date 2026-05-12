import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";

const URUN_PATCH_KEYS = new Set([
  "kategori_id",
  "urun_kodu",
  "barkod",
  "urun_adi",
  "detay",
  "yeni_mi",
  "guncelleme",
  "aktif",
]);

type Body = {
  tip?: string;
  payload?: {
    uid?: string | null;
    urunPayload?: Record<string, unknown>;
    varyantlar?: unknown[];
  };
};

function rastgeleHexRenk(): string {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const buf = new Uint8Array(3);
    globalThis.crypto.getRandomValues(buf);
    return `#${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  const n = Math.floor(Math.random() * 0xffffff);
  return `#${n.toString(16).toUpperCase().padStart(6, "0")}`;
}

function pickUrunRow(
  urunPayload: Record<string, unknown>,
  firmaId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { firma_id: firmaId };
  for (const k of URUN_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(urunPayload, k)) {
      out[k] = urunPayload[k];
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  const firmaId = getFirmaSessionIdFromRequest(request);
  if (!firmaId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }

  const tip = String(body.tip ?? "").trim().toLowerCase();
  if (tip !== "urun_kaydet") {
    return NextResponse.json({ ok: false, error: "Geçersiz tip." }, { status: 400 });
  }

  const payload = body.payload ?? {};
  const urunPayload = payload.urunPayload;
  if (!urunPayload || typeof urunPayload !== "object") {
    return NextResponse.json({ ok: false, error: "urunPayload zorunlu." }, { status: 400 });
  }

  const payloadFirma = urunPayload.firma_id;
  if (String(payloadFirma ?? "").trim() !== firmaId) {
    return NextResponse.json(
      { ok: false, error: "firma_id oturum ile eşleşmiyor." },
      { status: 403 },
    );
  }

  const rawUid = payload.uid;
  const uid =
    rawUid == null || String(rawUid).trim() === "" ? null : String(rawUid).trim();

  const varyantlarRaw = Array.isArray(payload.varyantlar) ? payload.varyantlar : [];

  let sb: ReturnType<typeof createFirmaServiceRoleClient>;
  try {
    sb = createFirmaServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Sunucu yapılandırması eksik.",
      },
      { status: 500 },
    );
  }

  const row = pickUrunRow(urunPayload as Record<string, unknown>, firmaId);

  try {
    let finalId = uid;

    if (uid) {
      const { data: mevcut, error: rf } = await sb
        .from("urunler")
        .select("id")
        .eq("id", uid)
        .eq("firma_id", firmaId)
        .maybeSingle();
      if (rf) throw rf;
      if (!mevcut) {
        return NextResponse.json({ ok: false, error: "Ürün bulunamadı." }, { status: 404 });
      }
      const { error: upErr } = await sb.from("urunler").update(row).eq("id", uid).eq("firma_id", firmaId);
      if (upErr) throw upErr;
      finalId = uid;
    } else {
      const { data: ins, error: insErr } = await sb
        .from("urunler")
        .insert(row)
        .select("id")
        .single();
      if (insErr) throw insErr;
      const newId = (ins as { id?: string } | null)?.id;
      if (!newId) {
        return NextResponse.json({ ok: false, error: "Ürün oluşturulamadı." }, { status: 500 });
      }
      finalId = newId;
    }

    const { error: delErr } = await sb.from("varyantlar").delete().eq("urun_id", finalId);
    if (delErr) throw delErr;

    const toInsert: Record<string, unknown>[] = [];
    for (const v of varyantlarRaw) {
      const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
      const renkAdi = String(o.renk_adi ?? "").trim();
      if (!renkAdi) continue;
      toInsert.push({
        urun_id: finalId,
        renk_adi: renkAdi,
        renk_hex:
          typeof o.renk_hex === "string" && o.renk_hex.trim()
            ? o.renk_hex.trim()
            : rastgeleHexRenk(),
        gorsel_url: o.gorsel_url == null ? null : o.gorsel_url,
        stok_durumu: o.stok_durumu ?? null,
        stok_miktar:
          o.stok_miktar == null
            ? null
            : Number.isFinite(Number(o.stok_miktar))
              ? Number(o.stok_miktar)
              : null,
        stok_birimi: o.stok_birimi == null ? "adet" : String(o.stok_birimi),
        min_siparis:
          o.min_siparis == null
            ? null
            : Number.isFinite(Number(o.min_siparis))
              ? Number(o.min_siparis)
              : null,
      });
    }

    if (toInsert.length > 0) {
      const { error: vIns } = await sb.from("varyantlar").insert(toInsert);
      if (vIns) throw vIns;
    }

    return NextResponse.json({ ok: true, id: finalId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Kayıt başarısız." },
      { status: 500 },
    );
  }
}
