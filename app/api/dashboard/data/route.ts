import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { toplamFotografGorselUrl } from "@/lib/admin-istatistik";
import type { FirmaLimitBilgisi } from "@/lib/firma-limit-usage";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";
import { MUSTERI_LISTE_SUTUNLARI } from "@/lib/musteri-sutunlar";
import {
  createFirmaServiceRoleClient,
  firmaCoz,
  FIRMA_SUTUN_SECIM,
} from "@/lib/supabase-firma";
import type { Kategori, Musteri, Urun } from "@/lib/types";

const PAGE_SIZE = 50;

const L = (n: number, d: number) => (Number.isFinite(n) && n > 0 ? n : d);

async function limitBilgisiSb(
  sb: ReturnType<typeof createFirmaServiceRoleClient>,
  firmaId: string,
): Promise<FirmaLimitBilgisi> {
  const fRes = await sb
    .from("firmalar")
    .select("max_kategori, max_musteri, max_urun, max_fotograf")
    .eq("id", firmaId)
    .maybeSingle();
  if (fRes.error) throw fRes.error;
  const fr = fRes.data as {
    max_kategori: number | null;
    max_musteri: number | null;
    max_urun: number | null;
    max_fotograf: number | null;
  } | null;
  const limits = {
    max_kategori: L(fr?.max_kategori ?? 10, 10),
    max_musteri: L(fr?.max_musteri ?? 50, 50),
    max_urun: L(fr?.max_urun ?? 100, 100),
    max_fotograf: L(fr?.max_fotograf ?? 500, 500),
  };

  const [kat, mst, urn, urows] = await Promise.all([
    sb
      .from("kategoriler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId)
      .eq("ozel", false),
    sb
      .from("musteriler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId),
    sb
      .from("urunler")
      .select("id", { count: "exact", head: true })
      .eq("firma_id", firmaId),
    sb.from("urunler").select("id").eq("firma_id", firmaId),
  ]);
  if (kat.error) throw kat.error;
  if (mst.error) throw mst.error;
  if (urn.error) throw urn.error;
  if (urows.error) throw urows.error;

  const urunIdler = (urows.data as { id: string }[] | null) ?? [];
  let fotograf = 0;
  if (urunIdler.length > 0) {
    const uids = urunIdler.map((r) => r.id);
    const { data: vrows, error: ve } = await sb
      .from("varyantlar")
      .select("gorsel_url")
      .in("urun_id", uids);
    if (ve) throw ve;
    for (const v of (vrows as { gorsel_url: string | null }[] | null) ?? []) {
      fotograf += toplamFotografGorselUrl(v.gorsel_url);
    }
  }

  return {
    limits,
    kullanim: {
      kategori: kat.count ?? 0,
      musteri: mst.count ?? 0,
      urun: urn.count ?? 0,
      fotograf,
    },
  };
}

function toplamAdet(raw: Record<string, unknown>): number {
  const n0 = Number(raw.toplam_urun ?? 0);
  if (Number.isFinite(n0) && n0 > 0) return n0;
  const n1 = Number(raw.toplam_urun_adedi ?? 0);
  if (Number.isFinite(n1) && n1 > 0) return n1;
  const n2 = Number(raw.toplam_adet ?? 0);
  if (Number.isFinite(n2) && n2 > 0) return n2;
  const n3 = Number(raw.urun_adedi ?? 0);
  if (Number.isFinite(n3) && n3 > 0) return n3;
  return 0;
}

export async function GET(request: NextRequest) {
  const firmaId = getFirmaSessionIdFromRequest(request);
  if (!firmaId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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

  const tipRaw = request.nextUrl.searchParams.get("tip") ?? "";
  const tip = tipRaw.trim().toLowerCase();

  try {
    if (tip === "ozet") {
      const [u, k, m] = await Promise.all([
        sb
          .from("urunler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId),
        sb
          .from("kategoriler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId),
        sb
          .from("musteriler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId),
      ]);
      if (u.error) throw u.error;
      if (k.error) throw k.error;
      if (m.error) throw m.error;
      return NextResponse.json({
        ok: true,
        urun: u.count ?? 0,
        kategori: k.count ?? 0,
        musteri: m.count ?? 0,
      });
    }

    const sayfa = Math.max(
      1,
      Number.parseInt(request.nextUrl.searchParams.get("sayfa") ?? "1", 10) || 1,
    );
    const pageIdx = sayfa - 1;

    if (tip === "kategoriler") {
      const [katRes, katCountRes, lim] = await Promise.all([
        sb
          .from("kategoriler")
          .select("id, kategori_adi, sira, aktif, ozel, created_at")
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1)
          .order("sira", { ascending: true }),
        sb
          .from("kategoriler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId)
          .is("deleted_at", null),
        limitBilgisiSb(sb, firmaId),
      ]);
      if (katRes.error) throw katRes.error;
      const rows =
        ((katRes.data as Omit<Kategori, "firma_id">[]) ?? []).map((row) => ({
          ...row,
          firma_id: firmaId,
        })) as Kategori[];
      return NextResponse.json({
        ok: true,
        rows,
        totalCount: katCountRes.count ?? 0,
        limitB: lim,
        sayfa,
        sayfaBoyutu: PAGE_SIZE,
      });
    }

    if (tip === "musteriler") {
      const [mRes, mCountRes, lRes, kRes, uRes, lim] = await Promise.all([
        sb
          .from("musteriler")
          .select(MUSTERI_LISTE_SUTUNLARI)
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1)
          .order("musteri_kodu", { ascending: true }),
        sb
          .from("musteriler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId)
          .is("deleted_at", null),
        sb
          .from("fiyat_listeleri")
          .select("*")
          .eq("firma_id", firmaId)
          .eq("aktif", true)
          .order("liste_adi", { ascending: true }),
        sb.from("fiyat_liste_kalemleri").select("*").eq("firma_id", firmaId),
        sb
          .from("urunler")
          .select("urun_kodu, urun_adi, fiyat, aktif")
          .eq("firma_id", firmaId),
        limitBilgisiSb(sb, firmaId),
      ]);
      if (mRes.error) throw mRes.error;
      if (lRes.error) throw lRes.error;
      if (kRes.error) throw kRes.error;
      if (uRes.error) throw uRes.error;

      const fiyatKalemleri = (
        ((kRes.data as Record<string, unknown>[]) ?? []).map((k) => ({
          id: String(k.id ?? ""),
          liste_id: String(k.liste_id ?? ""),
          firma_id: String(k.firma_id ?? ""),
          urun_kodu: String(k.urun_kodu ?? ""),
          fiyat: Number(k.fiyat ?? 0),
        }))
      );

      return NextResponse.json({
        ok: true,
        musteriler: (mRes.data as Musteri[]) ?? [],
        totalCount: mCountRes.count ?? 0,
        fiyatListeleri: lRes.data ?? [],
        fiyatKalemleri,
        urunler: uRes.data ?? [],
        limitB: lim,
        sayfa,
        sayfaBoyutu: PAGE_SIZE,
      });
    }

    if (tip === "urunler") {
      const [uRes, uCountRes] = await Promise.all([
        sb
          .from("urunler")
          .select(
            "id, urun_kodu, urun_adi, fiyat, para_birimi, aktif, barkod, kategori_id, created_at, yeni_mi, guncelleme, kategoriler(id, kategori_adi)",
          )
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1)
          .order("urun_kodu", { ascending: true }),
        sb
          .from("urunler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .order("urun_kodu", { ascending: true }),
      ]);
      if (uRes.error) throw uRes.error;

      type KatJoin = Pick<Kategori, "id" | "kategori_adi">;
      type UrunListeSatir = {
        id: string;
        urun_kodu: string;
        urun_adi: string;
        fiyat: unknown;
        para_birimi: unknown;
        aktif: boolean;
        barkod: string | null;
        kategori_id: string;
        created_at: string | null;
        yeni_mi: boolean;
        guncelleme: string | null;
        kategoriler?: KatJoin | KatJoin[] | null;
      };
      const satirlar =
        ((uRes.data ?? []) as unknown as UrunListeSatir[]) ?? [];
      const katById: Record<string, string> = {};
      satirlar.forEach((row) => {
        const raw = row.kategoriler;
        const kat = Array.isArray(raw) ? raw[0] : raw;
        if (kat?.kategori_adi) katById[row.kategori_id] = kat.kategori_adi;
      });
      const rows = satirlar.map((row) => {
        const { kategoriler: _k, ...u } = row;
        const out = {
          ...u,
          firma_id: firmaId,
          detay: null as string | null,
        };
        return out as Urun;
      });

      return NextResponse.json({
        ok: true,
        rows,
        katById,
        totalCount: uCountRes.count ?? 0,
        sayfa,
        sayfaBoyutu: PAGE_SIZE,
      });
    }

    if (tip === "siparisler") {
      const [sRes, sCountRes] = await Promise.all([
        sb
          .from("siparisler")
          .select(
            "id, firma_id, durum, created_at, updated_at, notlar, esnaf_notu, kargo_notu, toplam_urun, musteri_id, musteriler(id, musteri_adi, musteri_kodu)",
          )
          .eq("firma_id", firmaId)
          .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1)
          .order("created_at", { ascending: false }),
        sb
          .from("siparisler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId),
      ]);
      if (sRes.error) throw sRes.error;

      const siparisler = ((sRes.data as Record<string, unknown>[]) ?? []).map((r) => {
        const mus = r.musteriler as { musteri_adi?: string } | null | undefined;
        return {
          id: String(r.id ?? ""),
          firma_id: String(r.firma_id ?? firmaId),
          musteri_id: r.musteri_id ? String(r.musteri_id) : null,
          musteri_adi: mus?.musteri_adi ? String(mus.musteri_adi) : null,
          durum: String(r.durum ?? "istek"),
          created_at: r.created_at ? String(r.created_at) : null,
          toplam_urun_adedi: toplamAdet(r),
        };
      });

      return NextResponse.json({
        ok: true,
        rows: siparisler,
        totalCount: sCountRes.count ?? 0,
        sayfa,
        sayfaBoyutu: PAGE_SIZE,
      });
    }

    if (tip === "aktivite") {
      const { data, error } = await sb
        .from("aktivite_logu")
        .select("*")
        .eq("firma_id", firmaId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return NextResponse.json({ ok: true, rows: data ?? [] });
    }

    if (tip === "ayarlar") {
      const { data, error } = await sb
        .from("firmalar")
        .select(FIRMA_SUTUN_SECIM)
        .eq("id", firmaId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json({ ok: false, error: "Firma bulunamadı." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, firma: firmaCoz(data) });
    }

    if (tip === "copkutusu") {
      const otuzGunOnceIso = new Date();
      otuzGunOnceIso.setDate(otuzGunOnceIso.getDate() - 30);
      const iso = otuzGunOnceIso.toISOString();

      const [uRes, kRes, mRes] = await Promise.all([
        sb
          .from("urunler")
          .select("id, urun_kodu, urun_adi, deleted_at")
          .eq("firma_id", firmaId)
          .not("deleted_at", "is", null)
          .gte("deleted_at", iso)
          .order("deleted_at", { ascending: false }),
        sb
          .from("kategoriler")
          .select("id, kategori_adi, deleted_at")
          .eq("firma_id", firmaId)
          .not("deleted_at", "is", null)
          .gte("deleted_at", iso)
          .order("deleted_at", { ascending: false }),
        sb
          .from("musteriler")
          .select("id, musteri_kodu, musteri_adi, deleted_at")
          .eq("firma_id", firmaId)
          .not("deleted_at", "is", null)
          .gte("deleted_at", iso)
          .order("deleted_at", { ascending: false }),
      ]);
      if (uRes.error) throw uRes.error;
      if (kRes.error) throw kRes.error;
      if (mRes.error) throw mRes.error;

      return NextResponse.json({
        ok: true,
        urunler: uRes.data ?? [],
        kategoriler: kRes.data ?? [],
        musteriler: mRes.data ?? [],
      });
    }

    return NextResponse.json(
      {
        ok: false,
        error: `Geçersiz tip: ${tipRaw}.`,
      },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Veri alınamadı.",
      },
      { status: 500 },
    );
  }
}
