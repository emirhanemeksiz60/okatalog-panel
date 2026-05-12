import { NextResponse } from "next/server";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import type { Kategori, Urun, Varyant } from "@/lib/types";

type RouteCtx = { params: Promise<{ id: string }> };

const URUN_SELECT =
  "id, firma_id, urun_kodu, urun_adi, detay, fiyat, para_birimi, aktif, yeni_mi, guncelleme, kategori_id, varyantlar(id, renk_adi, renk_hex, gorsel_url, stok_durumu, stok_miktar, stok_birimi, min_siparis)";

export async function GET(_req: Request, context: RouteCtx) {
  const { id } = await context.params;
  const urunId = (id ?? "").trim();
  if (!urunId) {
    return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
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

  try {
    const { data: raw, error: uErr } = await sb
      .from("urunler")
      .select(URUN_SELECT)
      .eq("id", urunId)
      .maybeSingle();
    if (uErr) throw uErr;

    type UrunVaryantRow = Urun & { varyantlar?: Varyant[] | null };
    const row = raw as UrunVaryantRow | null;
    if (!row || !row.aktif) {
      return NextResponse.json({ ok: false, error: "Ürün bulunamadı." }, { status: 404 });
    }

    const { varyantlar: vrows, ...urunRest } = row;
    const urun: Urun = {
      ...urunRest,
      firma_id: urunRest.firma_id ?? "",
      detay: urunRest.detay ?? null,
    } as Urun;

    const varyantlar = [...(vrows ?? [])].sort((a, b) => a.id.localeCompare(b.id));

    let kategoriAdi: string | null = null;
    const { data: kat, error: kE } = await sb
      .from("kategoriler")
      .select("kategori_adi")
      .eq("id", urun.kategori_id)
      .maybeSingle();
    if (!kE && kat) {
      kategoriAdi = (kat as Pick<Kategori, "kategori_adi">).kategori_adi ?? null;
    }

    return NextResponse.json({
      ok: true,
      urun,
      varyantlar,
      kategori_adi: kategoriAdi,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Yükleme hatası." },
      { status: 500 },
    );
  }
}
