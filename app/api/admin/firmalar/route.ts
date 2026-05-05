import { NextResponse } from "next/server";
import { unauthorizedUnlessAdmin } from "@/lib/admin-route-guard";
import { firmaBasiIstatikler } from "@/lib/admin-aggregates";
import { createFirmaServiceRoleClient, firmaCoz } from "@/lib/supabase-firma";
import type { PaketKodu } from "@/lib/admin-paketler";

type PostBody = {
  firma_kodu?: string;
  firma_adi?: string;
  slogan?: string | null;
};

export async function GET() {
  const deny = await unauthorizedUnlessAdmin();
  if (deny) return deny;

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
    .select("*")
    .order("firma_kodu", { ascending: true });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  const list =
    (data as unknown as Record<string, unknown>[])?.map((r) => firmaCoz(r)) ?? [];
  const idler = list.map((l) => l.id);
  const I = await firmaBasiIstatikler(idler);
  const rows = list.map((firma) => {
    const s = I.get(firma.id) ?? { urun: 0, musteri: 0, fotograf: 0 };
    return { ...firma, u: s.urun, m: s.musteri, f: s.fotograf };
  });
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  const deny = await unauthorizedUnlessAdmin();
  if (deny) return deny;

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz JSON." }, { status: 400 });
  }

  const kod = String(body.firma_kodu ?? "").trim().toLowerCase();
  const ad = String(body.firma_adi ?? "").trim();
  if (!kod || !ad) {
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

  const slogan =
    body.slogan == null ? null : String(body.slogan).trim() || null;

  const { data, error } = await sb
    .from("firmalar")
    .insert({
      firma_kodu: kod,
      firma_adi: ad,
      slogan,
      logo_url: null,
      max_kategori: 5,
      max_musteri: 50,
      max_urun: 100,
      max_varyant: 500,
      max_fotograf: 500,
      max_ai_gunluk: 5,
      ai_kullanim_bugun: 0,
      aktif_paket: "baslangic" as PaketKodu,
      paket_bitis_tarihi: null,
      notlar: null,
      aktif: true,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  const id = (data as { id?: string } | null)?.id;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Firma oluşturulamadı." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, id });
}
