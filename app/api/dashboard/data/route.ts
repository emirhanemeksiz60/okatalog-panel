import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { firmaLimitBilgisiSb } from "@/lib/firma-limit-server";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";
import { MUSTERI_LISTE_SUTUNLARI } from "@/lib/musteri-sutunlar";
import {
  createFirmaServiceRoleClient,
  firmaCoz,
  FIRMA_SUTUN_SECIM,
} from "@/lib/supabase-firma";
import type { Kategori, Musteri, Urun } from "@/lib/types";

const PAGE_SIZE = 50;

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

    const q = request.nextUrl.searchParams;

    if (tip === "limit_bilgisi") {
      const limitB = await firmaLimitBilgisiSb(sb, firmaId);
      return NextResponse.json({ ok: true, limitB });
    }

    if (tip === "urun_detay") {
      const urunId = (q.get("id") ?? "").trim();
      if (!urunId) {
        return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
      }
      const [katRes, uRes, vRes] = await Promise.all([
        sb
          .from("kategoriler")
          .select("*")
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .order("sira", { ascending: true }),
        sb
          .from("urunler")
          .select("*")
          .eq("id", urunId)
          .eq("firma_id", firmaId)
          .maybeSingle(),
        sb
          .from("varyantlar")
          .select("*")
          .eq("urun_id", urunId)
          .order("id", { ascending: true }),
      ]);
      if (katRes.error) throw katRes.error;
      if (uRes.error) throw uRes.error;
      if (vRes.error) throw vRes.error;
      if (!uRes.data) {
        return NextResponse.json({ ok: false, error: "Ürün bulunamadı." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        kategoriler: katRes.data ?? [],
        urun: uRes.data,
        varyantlar: vRes.data ?? [],
      });
    }

    if (tip === "urun_kodlari") {
      const { data, error } = await sb
        .from("urunler")
        .select("id, urun_kodu")
        .eq("firma_id", firmaId)
        .is("deleted_at", null);
      if (error) throw error;
      const urunler = ((data ?? []) as { id: string; urun_kodu: string }[]).map((x) => ({
        id: x.id,
        urun_kodu: x.urun_kodu,
      }));
      const kodlar = urunler.map((x) => x.urun_kodu);
      return NextResponse.json({ ok: true, urunler, kodlar });
    }

    if (tip === "urunler_fiyat") {
      const { data, error } = await sb
        .from("urunler")
        .select("urun_kodu, urun_adi, fiyat, aktif")
        .eq("firma_id", firmaId)
        .is("deleted_at", null)
        .order("urun_kodu", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, urunler: data ?? [] });
    }

    if (tip === "fiyat_listeleri") {
      const [lRes, kRowsRes] = await Promise.all([
        sb
          .from("fiyat_listeleri")
          .select("*")
          .eq("firma_id", firmaId)
          .eq("aktif", true)
          .order("liste_adi", { ascending: true }),
        sb.from("fiyat_liste_kalemleri").select("liste_id").eq("firma_id", firmaId),
      ]);
      if (lRes.error) throw lRes.error;
      if (kRowsRes.error) throw kRowsRes.error;
      const counts: Record<string, number> = {};
      for (const r of (kRowsRes.data as { liste_id?: string }[] | null) ?? []) {
        const lid = String(r.liste_id ?? "");
        if (!lid) continue;
        counts[lid] = (counts[lid] ?? 0) + 1;
      }
      return NextResponse.json({
        ok: true,
        fiyatListeleri: lRes.data ?? [],
        kalemSayilari: counts,
      });
    }

    if (tip === "fiyat_liste_kalemleri") {
      const listeId = (q.get("liste_id") ?? "").trim();
      if (!listeId) {
        return NextResponse.json({ ok: false, error: "liste_id zorunlu." }, { status: 400 });
      }
      const { data: liste, error: le } = await sb
        .from("fiyat_listeleri")
        .select("id")
        .eq("id", listeId)
        .eq("firma_id", firmaId)
        .maybeSingle();
      if (le) throw le;
      if (!liste) {
        return NextResponse.json({ ok: false, error: "Liste bulunamadı." }, { status: 404 });
      }
      const { data: ks, error: ke } = await sb
        .from("fiyat_liste_kalemleri")
        .select("*")
        .eq("firma_id", firmaId)
        .eq("liste_id", listeId);
      if (ke) throw ke;
      const rawRows = (ks ?? []) as Record<string, unknown>[];
      const kods = [
        ...new Set(
          rawRows
            .map((x) => String(x.urun_kodu ?? "").trim())
            .filter(Boolean),
        ),
      ];
      const urByKod = new Map<string, { urun_adi: string | null; aktif: boolean; fiyat: unknown }>();
      if (kods.length > 0) {
        const { data: urs, error: ue } = await sb
          .from("urunler")
          .select("urun_kodu, urun_adi, aktif, fiyat")
          .eq("firma_id", firmaId)
          .in("urun_kodu", kods);
        if (ue) throw ue;
        for (const u of (urs as {
          urun_kodu: string;
          urun_adi: string | null;
          aktif: boolean;
          fiyat: unknown;
        }[]) ?? []) {
          urByKod.set(u.urun_kodu, u);
        }
      }
      const rows = rawRows.map((k) => {
        const cod = String(k.urun_kodu ?? "").trim();
        const urow = urByKod.get(cod);
        return {
          id: String(k.id ?? ""),
          liste_id: String(k.liste_id ?? ""),
          firma_id: String(k.firma_id ?? ""),
          urun_kodu: cod,
          fiyat: Number(k.fiyat ?? 0),
          urun_adi: urow?.urun_adi ?? null,
        };
      });
      rows.sort((a, b) => a.urun_kodu.localeCompare(b.urun_kodu, "tr"));
      return NextResponse.json({ ok: true, rows });
    }

    const sayfa = Math.max(
      1,
      Number.parseInt(q.get("sayfa") ?? "1", 10) || 1,
    );
    const pageIdx = sayfa - 1;

    if (tip === "kategoriler") {
      const hepsi =
        q.get("hepsi") === "1" ||
        q.get("hepsi") === "true" ||
        q.get("tum") === "1";
      const excelListe = q.get("excel") === "1";

      let listQ = sb
        .from("kategoriler")
        .select("id, kategori_adi, sira, aktif, ozel, created_at")
        .eq("firma_id", firmaId)
        .is("deleted_at", null)
        .order("sira", { ascending: true });
      if (excelListe) {
        listQ = listQ.eq("ozel", false);
      }
      if (!hepsi) {
        listQ = listQ.range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1);
      }

      let katCountQ = sb
        .from("kategoriler")
        .select("id", { count: "exact", head: true })
        .eq("firma_id", firmaId)
        .is("deleted_at", null);
      if (excelListe) {
        katCountQ = katCountQ.eq("ozel", false);
      }

      const [katCountRes, lim] = await Promise.all([
        katCountQ,
        firmaLimitBilgisiSb(sb, firmaId),
      ]);
      if (katCountRes.error) throw katCountRes.error;

      const katRes = await listQ;
      if (katRes.error) throw katRes.error;
      const rows = ((katRes.data as Omit<Kategori, "firma_id">[]) ?? []).map((row) => ({
        ...row,
        firma_id: firmaId,
      })) as Kategori[];
      return NextResponse.json({
        ok: true,
        rows,
        totalCount: katCountRes.count ?? 0,
        limitB: lim,
        sayfa: hepsi ? 1 : sayfa,
        sayfaBoyutu: hepsi ? Math.max(rows.length, 1) : PAGE_SIZE,
      });
    }

    if (tip === "musteriler") {
      const MUSTERI_SECIM = `${MUSTERI_LISTE_SUTUNLARI}, fiyat_listeleri!musteriler_fiyat_listesi_id_fkey(id, liste_adi, para_birimi, aktif)` as const;

      const [mRes, mCountRes, limRes] = await Promise.all([
        sb
          .from("musteriler")
          .select(MUSTERI_SECIM)
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE - 1)
          .order("musteri_kodu", { ascending: true }),
        sb
          .from("musteriler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId)
          .is("deleted_at", null),
        firmaLimitBilgisiSb(sb, firmaId),
      ]);
      if (mRes.error) {
        console.error("[dashboard/data tip=musteriler] Liste sorgusu hatası:", mRes.error);
        return NextResponse.json(
          {
            ok: false,
            error:
              typeof mRes.error.message === "string"
                ? mRes.error.message
                : "Müşteri listesi alınamadı.",
          },
          { status: 500 },
        );
      }
      if (mCountRes.error) {
        console.error("[dashboard/data tip=musteriler] Sayım sorgusu hatası:", mCountRes.error);
        return NextResponse.json(
          {
            ok: false,
            error:
              typeof mCountRes.error.message === "string"
                ? mCountRes.error.message
                : "Müşteri sayımı yapılamadı.",
          },
          { status: 500 },
        );
      }

      const lim = limRes;

      const musteriRows = ((mRes.data ?? []) as unknown as Musteri[]) ?? [];

      return NextResponse.json({
        ok: true,
        musteriler: musteriRows,
        totalCount: mCountRes.count ?? 0,
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
