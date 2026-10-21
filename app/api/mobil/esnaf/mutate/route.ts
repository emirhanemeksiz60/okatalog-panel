import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import { getMobilSession } from "@/lib/mobil-token";
import { musteriSifreBcryptUret } from "@/lib/musteri-sifre";
import { limitFotografMesaj, limitIletisimMesaj } from "@/lib/firma-limit-usage";
import {
  fetchLimitDurumu,
  fetchUrunVaryantKullanim,
  kategoriFirmaKontrol,
  musteriFirmaKontrol,
  normalizeVaryantlar,
  siparisFirmaKontrol,
  syncVaryantlarUpsert,
  urunFirmaKontrol,
  yeniFotografSayisi,
  type Sb,
} from "@/lib/mobil-esnaf-yardim";

const GENEL_HATA = "İşlem gerçekleştirilemedi.";

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}
function notFound(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 404 });
}
function limitError(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function strOrNull(v: unknown): string | null {
  const s = str(v).trim();
  return s ? s : null;
}
function nested(body: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = body[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : body;
}

async function insertGecmis(
  sb: Sb,
  params: { siparisId: string; onceki: string | null; yeni: string; degistiren: string; notText: string | null },
) {
  const { error } = await sb.from("siparis_gecmisi").insert({
    siparis_id: params.siparisId,
    onceki_durum: params.onceki,
    yeni_durum: params.yeni,
    degistiren: params.degistiren,
    not_text: params.notText?.trim() ? params.notText.trim() : null,
  });
  if (error) throw error;
}

/** Mobil `notifyMusteriBySiparis` karşılığı: müşterinin token'larına Expo push (hata sadece loglanır) */
async function notifyMusteri(sb: Sb, firmaId: string, musteriId: string | null, title: string) {
  if (!musteriId) return;
  try {
    const { data, error } = await sb.from("push_tokens").select("token").eq("musteri_id", musteriId);
    if (error) {
      console.error("[api/mobil/esnaf/mutate push_tokens]", error);
      return;
    }
    const tokens = (data ?? [])
      .map((r) => String((r as { token?: unknown }).token ?? "").trim())
      .filter(Boolean);
    for (const token of tokens) {
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to: token, sound: "default", title, body: title, data: { firma_id: firmaId } }),
        });
        if (!res.ok) console.error("[api/mobil/esnaf/mutate push]", res.status);
      } catch (e) {
        console.error("[api/mobil/esnaf/mutate push]", e);
      }
    }
  } catch (e) {
    console.error("[api/mobil/esnaf/mutate push]", e);
  }
}

async function firmaAdi(sb: Sb, firmaId: string, bodyDegistiren: unknown): Promise<string> {
  const given = str(bodyDegistiren).trim();
  if (given) return given;
  const { data } = await sb.from("firmalar").select("firma_adi").eq("id", firmaId).maybeSingle();
  return String(data?.firma_adi ?? "").trim() || "Esnaf";
}

type GecisOpts = {
  allowed: string[];
  hataMesaj: string;
  patch: (now: string) => Record<string, unknown>;
  yeniDurum: string;
  notText?: string | null;
  bildirim?: string;
};

/** Durum geçişi: sahiplik + durum kontrolü, update, siparis_gecmisi kaydı */
async function siparisGecis(
  sb: Sb,
  firmaId: string,
  siparisId: string,
  degistiren: string,
  opts: GecisOpts,
) {
  const cur = await siparisFirmaKontrol(sb, firmaId, siparisId);
  if (!cur) return notFound("Sipariş bulunamadı.");
  const durum = String(cur.durum ?? "");
  if (!opts.allowed.includes(durum)) return badRequest(opts.hataMesaj);
  const now = new Date().toISOString();
  const { error: upErr } = await sb
    .from("siparisler")
    .update(opts.patch(now))
    .eq("id", siparisId)
    .eq("firma_id", firmaId);
  if (upErr) throw upErr;
  await insertGecmis(sb, {
    siparisId,
    onceki: durum,
    yeni: opts.yeniDurum,
    degistiren,
    notText: opts.notText ?? null,
  });
  if (opts.bildirim) {
    await notifyMusteri(sb, firmaId, (cur.musteri_id as string | null) ?? null, opts.bildirim);
  }
  return NextResponse.json({ ok: true, error: null });
}

export async function POST(request: NextRequest) {
  const session = getMobilSession(request);
  if (!session || session.mode !== "esnaf") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const firmaId = session.firma_id;

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
    console.error("[api/mobil/esnaf/mutate] service role client", e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }

  try {
    // ---------- esnaf-service: appendGorselToVaryant ----------
    if (islem === "varyanta_gorsel_ekle") {
      const varyantId = str(body.varyant_id ?? body.varyantId).trim();
      const newUrl = str(body.gorsel_url ?? body.newUrl ?? body.url).trim();
      if (!varyantId) return badRequest("varyant_id zorunlu.");
      if (!newUrl) return badRequest("Geçersiz görsel adresi.");

      const { data: v, error: vErr } = await sb
        .from("varyantlar")
        .select("id, urun_id, gorsel_url")
        .eq("id", varyantId)
        .maybeSingle();
      if (vErr) throw vErr;
      if (!v?.urun_id) return notFound("Varyant bulunamadı.");
      if (!(await urunFirmaKontrol(sb, firmaId, String(v.urun_id)))) {
        return notFound("Varyant bulunamadı.");
      }

      const lim = await fetchLimitDurumu(sb, firmaId);
      if (lim.kullanim.fotograf + 1 > lim.limits.max_fotograf) {
        return limitError(limitFotografMesaj(lim.kullanim.fotograf + 1, lim.limits.max_fotograf));
      }

      const existing = String(v.gorsel_url ?? "").trim();
      const merged = existing ? `${existing}|${newUrl}` : newUrl;
      const { error: updErr } = await sb
        .from("varyantlar")
        .update({ gorsel_url: merged })
        .eq("id", varyantId);
      if (updErr) throw updErr;
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- esnaf-service: insertUrunWithVaryantlar ----------
    if (islem === "urun_ekle") {
      const urun = nested(body, "urun");
      const varyantlarRaw = Array.isArray(body.varyantlar) ? body.varyantlar : [];
      const kategoriId = str(urun.kategori_id).trim();
      const urunKodu = str(urun.urun_kodu).trim();
      const urunAdi = str(urun.urun_adi).trim();
      if (!kategoriId || !urunKodu || !urunAdi) {
        return badRequest("kategori_id, urun_kodu ve urun_adi zorunlu.");
      }
      if (!(await kategoriFirmaKontrol(sb, firmaId, kategoriId))) {
        return notFound("Kategori bulunamadı.");
      }

      const lim = await fetchLimitDurumu(sb, firmaId);
      if (lim.kullanim.urun >= lim.limits.max_urun) {
        return limitError(limitIletisimMesaj("urun", lim.kullanim.urun, lim.limits.max_urun));
      }
      const tahminiVaryant = normalizeVaryantlar(varyantlarRaw, "gecici").length;
      if (lim.kullanim.varyant + tahminiVaryant > lim.limits.max_varyant) {
        return limitError(
          `Varyant limitinize ulaştınız (${lim.kullanim.varyant + tahminiVaryant}/${lim.limits.max_varyant}). Yükseltmek için bizimle iletişime geçin.`,
        );
      }
      const yeniFoto = yeniFotografSayisi(varyantlarRaw as { gorsel_url?: unknown }[]);
      if (lim.kullanim.fotograf + yeniFoto > lim.limits.max_fotograf) {
        return limitError(limitFotografMesaj(lim.kullanim.fotograf + yeniFoto, lim.limits.max_fotograf));
      }

      const { data: inserted, error: uErr } = await sb
        .from("urunler")
        .insert({
          firma_id: firmaId,
          kategori_id: kategoriId,
          urun_kodu: urunKodu,
          barkod: strOrNull(urun.barkod),
          urun_adi: urunAdi,
          detay: strOrNull(urun.detay),
          fiyat:
            urun.fiyat == null || urun.fiyat === "" ? null : Number.isFinite(Number(urun.fiyat)) ? Number(urun.fiyat) : null,
          para_birimi: str(urun.para_birimi).trim().toUpperCase() || "TRY",
          yeni_mi: Boolean(urun.yeni_mi),
          guncelleme: strOrNull(urun.guncelleme),
          aktif: true,
        })
        .select("id")
        .maybeSingle();
      if (uErr) throw uErr;
      if (!inserted?.id) {
        return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
      }
      const urunId = String(inserted.id);

      try {
        const normalized = normalizeVaryantlar(varyantlarRaw, urunId);
        await syncVaryantlarUpsert(sb, urunId, normalized, true);
      } catch (e) {
        // Mobildeki gibi: varyant hatasında ürünü geri sil
        const { error: delErr } = await sb.from("urunler").delete().eq("id", urunId).eq("firma_id", firmaId);
        if (delErr) console.error("[api/mobil/esnaf/mutate urun_ekle geri-sil]", delErr);
        throw e;
      }
      return NextResponse.json({ ok: true, urunId, error: null });
    }

    // ---------- esnaf-service: updateUrunWithVaryantlar (UPSERT) ----------
    if (islem === "urun_guncelle") {
      const urun = nested(body, "urun");
      const urunId = str(body.urun_id ?? body.urunId ?? urun.id).trim();
      if (!urunId) return badRequest("urun_id zorunlu.");
      if (!(await urunFirmaKontrol(sb, firmaId, urunId))) return notFound("Ürün bulunamadı.");

      const varyantlarRaw = Array.isArray(body.varyantlar) ? body.varyantlar : [];
      const normalized = normalizeVaryantlar(varyantlarRaw, urunId);

      const kategoriId = urun.kategori_id != null ? str(urun.kategori_id).trim() : null;
      if (kategoriId && !(await kategoriFirmaKontrol(sb, firmaId, kategoriId))) {
        return notFound("Kategori bulunamadı.");
      }

      const lim = await fetchLimitDurumu(sb, firmaId);
      const eski = await fetchUrunVaryantKullanim(sb, urunId);
      const yeniVaryantToplam = lim.kullanim.varyant - eski.varyant + normalized.length;
      if (yeniVaryantToplam > lim.limits.max_varyant) {
        return limitError(
          `Varyant limitinize ulaştınız (${yeniVaryantToplam}/${lim.limits.max_varyant}). Yükseltmek için bizimle iletişime geçin.`,
        );
      }
      const yeniFotoToplam =
        lim.kullanim.fotograf - eski.fotograf + yeniFotografSayisi(normalized.map((n) => n.full));
      if (yeniFotoToplam > lim.limits.max_fotograf) {
        return limitError(limitFotografMesaj(yeniFotoToplam, lim.limits.max_fotograf));
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (kategoriId != null) patch.kategori_id = kategoriId;
      if (urun.urun_kodu != null) patch.urun_kodu = str(urun.urun_kodu).trim();
      if (urun.barkod !== undefined) patch.barkod = strOrNull(urun.barkod);
      if (urun.urun_adi != null) patch.urun_adi = str(urun.urun_adi).trim();
      if (urun.detay !== undefined) patch.detay = strOrNull(urun.detay);
      if (urun.fiyat !== undefined) {
        patch.fiyat =
          urun.fiyat == null || urun.fiyat === "" ? null : Number.isFinite(Number(urun.fiyat)) ? Number(urun.fiyat) : null;
      }
      if (urun.para_birimi != null) patch.para_birimi = str(urun.para_birimi).trim().toUpperCase() || "TRY";
      if (urun.yeni_mi != null) patch.yeni_mi = Boolean(urun.yeni_mi);
      if (urun.guncelleme !== undefined) patch.guncelleme = strOrNull(urun.guncelleme);
      if (urun.aktif != null) patch.aktif = Boolean(urun.aktif);

      const { error: upErr } = await sb
        .from("urunler")
        .update(patch)
        .eq("id", urunId)
        .eq("firma_id", firmaId);
      if (upErr) throw upErr;

      await syncVaryantlarUpsert(sb, urunId, normalized, false);
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- esnaf-service: softDeleteUrun ----------
    if (islem === "urun_sil") {
      const urunId = str(body.urun_id ?? body.urunId ?? body.id).trim();
      if (!urunId) return badRequest("urun_id zorunlu.");
      if (!(await urunFirmaKontrol(sb, firmaId, urunId))) return notFound("Ürün bulunamadı.");
      const { error } = await sb
        .from("urunler")
        .update({ aktif: false, updated_at: new Date().toISOString() })
        .eq("id", urunId)
        .eq("firma_id", firmaId);
      if (error) throw error;
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- esnaf-service: insertKategori ----------
    if (islem === "kategori_ekle") {
      const ad = str(body.kategori_adi ?? body.kategoriAdi).trim();
      if (!ad) return badRequest("kategori_adi zorunlu.");
      const lim = await fetchLimitDurumu(sb, firmaId);
      if (lim.kullanim.kategori >= lim.limits.max_kategori) {
        return limitError(limitIletisimMesaj("kategori", lim.kullanim.kategori, lim.limits.max_kategori));
      }
      const siraRaw = body.sira;
      const { error } = await sb.from("kategoriler").insert({
        firma_id: firmaId,
        kategori_adi: ad,
        sira: siraRaw == null ? null : Number.isFinite(Number(siraRaw)) ? Number(siraRaw) : null,
        ozel: false,
        aktif: true,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- esnaf-service: updateKategori ----------
    if (islem === "kategori_guncelle" || islem === "kategori_sil") {
      const src = nested(body, "patch");
      const kategoriId = str(body.kategori_id ?? body.kategoriId ?? body.id ?? src.id).trim();
      if (!kategoriId) return badRequest("kategori_id zorunlu.");
      if (!(await kategoriFirmaKontrol(sb, firmaId, kategoriId))) {
        return notFound("Kategori bulunamadı.");
      }
      const patch: Record<string, unknown> = {};
      if (islem === "kategori_sil") {
        patch.aktif = false;
      } else {
        if (src.kategori_adi != null) patch.kategori_adi = str(src.kategori_adi).trim();
        if (src.sira !== undefined) {
          patch.sira = src.sira == null ? null : Number.isFinite(Number(src.sira)) ? Number(src.sira) : null;
        }
        if (src.aktif != null) patch.aktif = Boolean(src.aktif);
        if (Object.keys(patch).length === 0) return badRequest("Güncellenecek alan yok.");
      }
      const { error } = await sb
        .from("kategoriler")
        .update(patch)
        .eq("id", kategoriId)
        .eq("firma_id", firmaId);
      if (error) throw error;
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- esnaf-service: insertMusteri (şifre hash'lenir) ----------
    if (islem === "musteri_ekle") {
      const kod = str(body.musteri_kodu ?? body.musteriKodu).trim();
      const ad = strOrNull(body.musteri_adi ?? body.musteriAdi);
      const sifre = str(body.sifre ?? body.sifre_plain);
      if (!kod || !sifre) return badRequest("musteri_kodu ve sifre zorunlu.");

      const lim = await fetchLimitDurumu(sb, firmaId);
      if (lim.kullanim.musteri >= lim.limits.max_musteri) {
        return limitError(limitIletisimMesaj("musteri", lim.kullanim.musteri, lim.limits.max_musteri));
      }

      const hash = await musteriSifreBcryptUret(sifre);
      const { error } = await sb.from("musteriler").insert({
        firma_id: firmaId,
        musteri_kodu: kod,
        musteri_adi: ad,
        sifre: hash,
        aktif: true,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- esnaf-service: updateMusteri / softDeleteMusteri ----------
    if (islem === "musteri_guncelle" || islem === "musteri_sil") {
      const src = nested(body, "patch");
      const musteriId = str(body.musteri_id ?? body.musteriId ?? body.id ?? src.id).trim();
      if (!musteriId) return badRequest("musteri_id zorunlu.");
      if (!(await musteriFirmaKontrol(sb, firmaId, musteriId))) {
        return notFound("Müşteri bulunamadı.");
      }
      const patch: Record<string, unknown> = {};
      if (islem === "musteri_sil") {
        patch.aktif = false;
      } else {
        if (src.musteri_kodu != null) patch.musteri_kodu = str(src.musteri_kodu).trim();
        if (src.musteri_adi !== undefined) patch.musteri_adi = strOrNull(src.musteri_adi);
        if (src.aktif != null) patch.aktif = Boolean(src.aktif);
        if (src.fiyat_listesi_id !== undefined) {
          patch.fiyat_listesi_id = strOrNull(src.fiyat_listesi_id);
          if (patch.fiyat_listesi_id) {
            const { data: liste, error: lErr } = await sb
              .from("fiyat_listeleri")
              .select("id")
              .eq("id", patch.fiyat_listesi_id as string)
              .eq("firma_id", firmaId)
              .maybeSingle();
            if (lErr) throw lErr;
            if (!liste) return notFound("Fiyat listesi bulunamadı.");
          }
        }
        const sifreRaw = src.sifre ?? src.sifre_plain;
        if (typeof sifreRaw === "string" && sifreRaw.trim().length > 0) {
          patch.sifre = await musteriSifreBcryptUret(sifreRaw);
        }
        if (Object.keys(patch).length === 0) return badRequest("Güncellenecek alan yok.");
      }
      const { error } = await sb
        .from("musteriler")
        .update(patch)
        .eq("id", musteriId)
        .eq("firma_id", firmaId);
      if (error) throw error;
      // sifre response'a asla eklenmez; patch DB'ye yazildi, yanit sadece ok/error
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- esnaf-order: esnafSiparisOnayla ----------
    if (islem === "siparis_onayla") {
      const siparisId = str(body.siparis_id ?? body.siparisId ?? body.id).trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");
      const bildirim = strOrNull(body.bildirimMetni ?? body.bildirim_metni);
      const degistiren = await firmaAdi(sb, firmaId, body.degisteren);
      return siparisGecis(sb, firmaId, siparisId, degistiren, {
        allowed: ["istek", "duzenlendi"],
        hataMesaj: "Bu sipariş bu aşamada onaylanamaz.",
        yeniDurum: "onaylandi",
        notText: bildirim,
        bildirim: "Siparişiniz onaylandı ✅",
        patch: (now) => ({
          durum: "onaylandi",
          onaylandi_at: now,
          updated_at: now,
          ...(bildirim ? { esnaf_notu: bildirim } : {}),
        }),
      });
    }

    // ---------- esnaf-order: esnafSiparisReddet ----------
    if (islem === "siparis_reddet") {
      const siparisId = str(body.siparis_id ?? body.siparisId ?? body.id).trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");
      const degistiren = await firmaAdi(sb, firmaId, body.degisteren);
      return siparisGecis(sb, firmaId, siparisId, degistiren, {
        allowed: ["istek", "duzenlendi"],
        hataMesaj: "Bu sipariş reddedilemez.",
        yeniDurum: "reddedildi",
        bildirim: "Siparişiniz reddedildi ❌",
        patch: (now) => ({ durum: "reddedildi", reddedildi_at: now, updated_at: now }),
      });
    }

    // ---------- esnaf-order: esnafSiparisHazirlaniyor ----------
    if (islem === "siparis_hazirlaniyor") {
      const siparisId = str(body.siparis_id ?? body.siparisId ?? body.id).trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");
      const degistiren = await firmaAdi(sb, firmaId, body.degisteren);
      return siparisGecis(sb, firmaId, siparisId, degistiren, {
        allowed: ["onaylandi"],
        hataMesaj: "Yalnızca onaylı siparişler hazırlanabilir.",
        yeniDurum: "hazirlaniyor",
        bildirim: "Siparişiniz hazırlanıyor 📦",
        patch: (now) => ({ durum: "hazirlaniyor", hazirlaniyor_at: now, updated_at: now }),
      });
    }
    // ---------- esnaf-order: esnafSiparisDuzenleVeIste (toplu) ----------
    if (islem === "siparis_duzenle") {
      const siparisId = str(body.siparis_id ?? body.siparisId ?? body.id).trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");
      const degistiren = await firmaAdi(sb, firmaId, body.degisteren);
      const kalemlerRaw = Array.isArray(body.kalemler) ? body.kalemler : [];
      const silinenRaw = Array.isArray(body.silinenKalemIds)
        ? body.silinenKalemIds
        : Array.isArray(body.silinen_kalem_ids)
          ? body.silinen_kalem_ids
          : [];

      const cur = await siparisFirmaKontrol(sb, firmaId, siparisId);
      if (!cur) return notFound("Sipariş bulunamadı.");
      const durum = String(cur.durum ?? "");
      if (durum !== "istek" && durum !== "duzenlendi") {
        return badRequest("Bu sipariş düzenlenemez.");
      }

      type PatchKalem = { id: string; adet: number };
      const patchList: PatchKalem[] = [];
      for (const k of kalemlerRaw) {
        const o = k && typeof k === "object" ? (k as Record<string, unknown>) : {};
        const id = str(o.id).trim();
        const adet = Number(o.adet);
        if (id && Number.isFinite(adet)) patchList.push({ id, adet });
      }
      const kalan = patchList.filter((k) => k.adet > 0);
      if (kalan.length === 0) return badRequest("En az bir ürün satırı kalmalıdır.");
      const silinenIds = [...new Set(silinenRaw.map((x) => str(x).trim()).filter(Boolean))];

      // Tek sorgu: siparişin tüm kalemleri
      const { data: allRows, error: allErr } = await sb
        .from("siparis_kalemleri")
        .select("*")
        .eq("siparis_id", siparisId);
      if (allErr) throw allErr;
      const all = (allRows ?? []) as Record<string, unknown>[];
      const byId = new Map(all.map((r) => [String(r.id), r]));
      if (kalan.some((k) => !byId.has(k.id)) || silinenIds.some((id) => !byId.has(id))) {
        return notFound("Sipariş kalemi bulunamadı.");
      }

      // Silinenler: tek UPDATE (.in)
      if (silinenIds.length > 0) {
        const { error: delErr } = await sb
          .from("siparis_kalemleri")
          .update({ adet: 0, toplam_fiyat: 0, durum: "kaldirildi" })
          .in("id", silinenIds)
          .eq("siparis_id", siparisId);
        if (delErr) throw delErr;
      }

      // Kalanlar: tek UPSERT (tam satırlar, adet/toplam/durum güncellenir)
      const upsertRows = kalan.map((k) => {
        const orig = byId.get(k.id)!;
        const birim = orig.birim_fiyat == null ? null : Number(orig.birim_fiyat);
        return {
          ...orig,
          adet: k.adet,
          toplam_fiyat: birim == null ? null : birim * k.adet,
          durum: "duzenlendi",
        };
      });
      if (upsertRows.length > 0) {
        const { error: upErr } = await sb.from("siparis_kalemleri").upsert(upsertRows);
        if (upErr) throw upErr;
      }

      // Toplam: bellekte (silinen=0, kalan=yeni adet, diğerleri=eski adet)
      const silinenSet = new Set(silinenIds);
      const kalanMap = new Map(kalan.map((k) => [k.id, k.adet]));
      const toplam = all.reduce((s, r) => {
        const rid = String(r.id);
        if (silinenSet.has(rid)) return s;
        if (kalanMap.has(rid)) return s + (kalanMap.get(rid) ?? 0);
        return s + (Number(r.adet) || 0);
      }, 0);

      const now = new Date().toISOString();
      const { error: upS } = await sb
        .from("siparisler")
        .update({ durum: "duzenlendi", toplam_urun: toplam, updated_at: now })
        .eq("id", siparisId)
        .eq("firma_id", firmaId);
      if (upS) throw upS;

      await insertGecmis(sb, {
        siparisId,
        onceki: durum,
        yeni: "duzenlendi",
        degistiren,
        notText: "Sipariş kalemleri güncellendi; müşteri onayı bekleniyor.",
      });
      return NextResponse.json({ ok: true, error: null });
    }
    // ---------- esnaf-order: esnafSiparisGonderildiKargo ----------
    if (islem === "siparis_gonderildi") {
      const siparisId = str(body.siparis_id ?? body.siparisId ?? body.id).trim();
      if (!siparisId) return badRequest("siparis_id zorunlu.");
      const degistiren = await firmaAdi(sb, firmaId, body.degisteren);
      const kargoNotu = strOrNull(body.kargoNotu ?? body.kargo_notu);
      const gorselUrlsRaw = Array.isArray(body.gorselUrls)
        ? body.gorselUrls
        : Array.isArray(body.gorsel_urls)
          ? body.gorsel_urls
          : [];
      const gorselUrls = gorselUrlsRaw.map((u) => str(u).trim()).filter(Boolean);

      const cur = await siparisFirmaKontrol(sb, firmaId, siparisId);
      if (!cur) return notFound("Sipariş bulunamadı.");
      const durum = String(cur.durum ?? "");
      if (durum !== "hazirlaniyor") {
        return badRequest("Sipariş kargoya verilmeye uygun değil.");
      }

      if (gorselUrls.length > 0) {
        const { error: insErr } = await sb.from("kargo_gorselleri").insert(
          gorselUrls.map((url) => ({ siparis_id: siparisId, gorsel_url: url })),
        );
        if (insErr) throw insErr;
      }

      const now = new Date().toISOString();
      const { error: upErr } = await sb
        .from("siparisler")
        .update({
          durum: "gonderildi",
          gonderildi_at: now,
          updated_at: now,
          kargo_notu: kargoNotu,
        })
        .eq("id", siparisId)
        .eq("firma_id", firmaId);
      if (upErr) throw upErr;

      await insertGecmis(sb, {
        siparisId,
        onceki: durum,
        yeni: "gonderildi",
        degistiren,
        notText: kargoNotu,
      });
      await notifyMusteri(
        sb,
        firmaId,
        (cur.musteri_id as string | null) ?? null,
        "Siparişiniz kargoya verildi 🚚",
      );
      return NextResponse.json({ ok: true, error: null });
    }

    // ---------- ai-kullanim: rpcAiKullanimTuket ----------
    if (islem === "ai_kullanim_tuket") {
      const { error } = await sb.rpc("ai_kullanim_tuket", { firma_id: firmaId });
      if (error) {
        const m = String((error as { message?: string }).message ?? "");
        // Mobildeki gibi: RPC yoksa sessizce başarılı say
        if (/does not exist|schema cache|404|Could not find/i.test(m)) {
          return NextResponse.json({ ok: true, error: null });
        }
        throw error;
      }
      return NextResponse.json({ ok: true, error: null });
    }

    return badRequest(`Geçersiz islem: ${islem || "(boş)"}.`);
  } catch (e) {
    console.error(`[api/mobil/esnaf/mutate ${islem || "?"}]`, e);
    return NextResponse.json({ ok: false, error: GENEL_HATA }, { status: 500 });
  }
}