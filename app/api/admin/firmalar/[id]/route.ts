import { NextResponse } from "next/server";
import { unauthorizedUnlessAdmin } from "@/lib/admin-route-guard";
import { firmaKullanimOzet } from "@/lib/admin-aggregates";
import {
  createFirmaServiceRoleClient,
  firmaCoz,
  FIRMA_SUTUN_SECIM,
} from "@/lib/supabase-firma";
import type { PaketKodu } from "@/lib/admin-paketler";

type RouteCtx = { params: Promise<{ id: string }> };

function ymddenIso(yyyyMmDd: string): string | null {
  if (!yyyyMmDd) return null;
  const t = new Date(yyyyMmDd + "T12:00:00.000Z");
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

type PatchBody = {
  firma_kodu?: string;
  firma_adi?: string;
  slogan?: string | null;
  logo_url?: string | null;
  max_kategori?: number;
  max_musteri?: number;
  max_urun?: number;
  max_varyant?: number;
  max_fotograf?: number;
  max_ai_gunluk?: number;
  aktif_paket?: PaketKodu | string;
  paket_bitis_ymd?: string;
  notlar?: string | null;
  aktif?: boolean;
};

export async function GET(_req: Request, context: RouteCtx) {
  const deny = await unauthorizedUnlessAdmin();
  if (deny) return deny;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "id eksik." }, { status: 400 });
  }

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

  const { data, error } = await sb
    .from("firmalar")
    .select(FIRMA_SUTUN_SECIM)
    .eq("id", id.trim())
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Firma bulunamadı." }, { status: 404 });
  }

  const firma = firmaCoz(data);
  let kullanim = null as Awaited<ReturnType<typeof firmaKullanimOzet>> | null;
  let kullanimUyari: string | null = null;
  try {
    kullanim = await firmaKullanimOzet(id.trim());
  } catch (ke) {
    kullanimUyari =
      ke instanceof Error ? ke.message : "Kullanım istatistikleri alınamadı";
  }

  return NextResponse.json({
    ok: true,
    firma,
    kullanim,
    kullanimUyari,
  });
}

export async function PATCH(req: Request, context: RouteCtx) {
  const deny = await unauthorizedUnlessAdmin();
  if (deny) return deny;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "id eksik." }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }

  const pak = (body.aktif_paket ?? "baslangic") as PaketKodu;
  const upd: Record<string, unknown> = {
    firma_kodu: String(body.firma_kodu ?? "").trim().toLowerCase(),
    firma_adi: String(body.firma_adi ?? "").trim(),
    slogan:
      body.slogan == null || !String(body.slogan).trim()
        ? null
        : String(body.slogan),
    logo_url:
      body.logo_url == null || !String(body.logo_url).trim()
        ? null
        : String(body.logo_url).trim(),
    max_kategori: Math.max(0, Number(body.max_kategori) || 0),
    max_musteri: Math.max(0, Number(body.max_musteri) || 0),
    max_urun: Math.max(0, Number(body.max_urun) || 0),
    max_varyant: Math.max(0, Number(body.max_varyant) || 0),
    max_fotograf: Math.max(0, Number(body.max_fotograf) || 0),
    max_ai_gunluk: Math.max(0, Number(body.max_ai_gunluk) || 5),
    aktif_paket: pak,
    paket_bitis_tarihi: ymddenIso(String(body.paket_bitis_ymd ?? "").trim()),
    notlar: body.notlar == null ? null : String(body.notlar) || null,
    aktif: Boolean(body.aktif),
  };

  if (!upd.firma_kodu || !upd.firma_adi) {
    return NextResponse.json(
      { ok: false, error: "firma_kodu ve firma_adi zorunludur." },
      { status: 400 },
    );
  }

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

  const { error } = await sb.from("firmalar").update(upd).eq("id", id.trim());
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
