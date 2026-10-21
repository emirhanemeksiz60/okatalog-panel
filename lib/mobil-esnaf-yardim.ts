import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";
import { firmaLimitBilgisiSb } from "@/lib/firma-limit-server";
import { toplamFotografGorselUrl } from "@/lib/admin-istatistik";

export type Sb = ReturnType<typeof createFirmaServiceRoleClient>;

/** Yanıtlarda asla dönmemesi gereken alanları (iç içe olsa bile) temizler. */
export function stripSensitive<T>(value: T): T {
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

function countGorselParcalariEsnaf(raw: string | null | undefined): number {
  if (raw == null || !String(raw).trim()) return 0;
  return String(raw)
    .split(/[,|]/)
    .map((x) => x.trim())
    .filter(Boolean).length;
}

/** Mobil `fetchEsnafFirmaKullanim` karşılığı (esnaf-service sayımları). */
export async function fetchEsnafKullanim(sb: Sb, firmaId: string) {
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
      fotograf += countGorselParcalariEsnaf(row.gorsel_url as string | null);
    }
  }
  return {
    urun: uRes.count ?? 0,
    kategori: kRes.count ?? 0,
    musteri: mRes.count ?? 0,
    fotograf,
  };
}

export type LimitDurumu = {
  limits: {
    max_urun: number;
    max_kategori: number;
    max_musteri: number;
    max_varyant: number;
    max_fotograf: number;
  };
  kullanim: {
    urun: number;
    kategori: number;
    musteri: number;
    varyant: number;
    fotograf: number;
  };
};

const L = (n: number, d: number) => (Number.isFinite(n) && n > 0 ? n : d);

/**
 * Panel `firmaLimitBilgisiSb` (max_urun/kategori/musteri/fotograf) + max_varyant.
 * Kullanım/fotoğraf hesabı paneldeki yöntemle yapılır.
 */
export async function fetchLimitDurumu(sb: Sb, firmaId: string): Promise<LimitDurumu> {
  const base = await firmaLimitBilgisiSb(sb, firmaId);

  const { data: firma, error: fErr } = await sb
    .from("firmalar")
    .select("max_varyant")
    .eq("id", firmaId)
    .maybeSingle();
  if (fErr) throw fErr;

  const { data: urunRows, error: uErr } = await sb
    .from("urunler")
    .select("id")
    .eq("firma_id", firmaId);
  if (uErr) throw uErr;
  const ids = ((urunRows ?? []) as { id: string }[]).map((r) => r.id);
  let varyant = 0;
  if (ids.length > 0) {
    const { count, error: vErr } = await sb
      .from("varyantlar")
      .select("id", { count: "exact", head: true })
      .in("urun_id", ids);
    if (vErr) throw vErr;
    varyant = count ?? 0;
  }

  return {
    limits: {
      max_urun: base.limits.max_urun,
      max_kategori: base.limits.max_kategori,
      max_musteri: base.limits.max_musteri,
      max_varyant: L(Number(firma?.max_varyant ?? 500), 500),
      max_fotograf: base.limits.max_fotograf,
    },
    kullanim: {
      urun: base.kullanim.urun,
      kategori: base.kullanim.kategori,
      musteri: base.kullanim.musteri,
      varyant,
      fotograf: base.kullanim.fotograf,
    },
  };
}

/** Tek ürünün mevcut varyant sayısı + fotoğraf sayısı (panel fotoğraf hesabı). */
export async function fetchUrunVaryantKullanim(sb: Sb, urunId: string) {
  const { data, error } = await sb
    .from("varyantlar")
    .select("gorsel_url")
    .eq("urun_id", urunId);
  if (error) throw error;
  const rows = (data ?? []) as { gorsel_url: string | null }[];
  return {
    varyant: rows.length,
    fotograf: rows.reduce((s, r) => s + toplamFotografGorselUrl(r.gorsel_url), 0),
  };
}

/** Yeni varyant satırlarındaki fotoğraf sayısı (panel fotoğraf hesabı). */
export function yeniFotografSayisi(varyantlar: { gorsel_url?: unknown }[]): number {
  return varyantlar.reduce(
    (s, v) => s + toplamFotografGorselUrl(typeof v.gorsel_url === "string" ? v.gorsel_url : null),
    0,
  );
}

// ---------------- Sahiplik kontrolleri (firma_id token'dan) ----------------

export async function urunFirmaKontrol(sb: Sb, firmaId: string, urunId: string) {
  const { data, error } = await sb
    .from("urunler")
    .select("id")
    .eq("id", urunId)
    .eq("firma_id", firmaId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function kategoriFirmaKontrol(sb: Sb, firmaId: string, kategoriId: string) {
  const { data, error } = await sb
    .from("kategoriler")
    .select("id")
    .eq("id", kategoriId)
    .eq("firma_id", firmaId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function musteriFirmaKontrol(sb: Sb, firmaId: string, musteriId: string) {
  const { data, error } = await sb
    .from("musteriler")
    .select("id")
    .eq("id", musteriId)
    .eq("firma_id", firmaId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function siparisFirmaKontrol(sb: Sb, firmaId: string, siparisId: string) {
  const { data, error } = await sb
    .from("siparisler")
    .select("id, durum, musteri_id")
    .eq("id", siparisId)
    .eq("firma_id", firmaId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ---------------- Varyant UPSERT (dashboard/urun yöntemi) ----------------

export type VaryantInput = Record<string, unknown>;

function varyantUidFromPayload(o: VaryantInput): string | null {
  const raw = o.uid ?? o.id;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

/** Mobil `VaryantFormInput` normalizasyonu */
export function normalizeVaryant(o: VaryantInput, urunId: string) {
  const renkAdi = String(o.renk_adi ?? "").trim();
  if (!renkAdi) return null;
  const hexRaw = typeof o.renk_hex === "string" ? o.renk_hex.trim() : "";
  const gorselRaw = typeof o.gorsel_url === "string" ? o.gorsel_url.trim() : "";
  const stokRaw = typeof o.stok_durumu === "string" ? o.stok_durumu.trim().toLowerCase() : "";
  return {
    urun_id: urunId,
    renk_adi: renkAdi,
    renk_hex: hexRaw || "#cfd8dc",
    gorsel_url: gorselRaw ? gorselRaw : null,
    stok_durumu: stokRaw ? stokRaw : null,
    stok_miktar:
      o.stok_miktar == null ? null : Number.isFinite(Number(o.stok_miktar)) ? Number(o.stok_miktar) : null,
    stok_birimi: (o.stok_birimi as string | null) ?? null,
    min_siparis:
      o.min_siparis == null ? null : Number.isFinite(Number(o.min_siparis)) ? Number(o.min_siparis) : null,
  };
}

export function normalizeVaryantlar(raw: unknown[], urunId: string) {
  const out: { uid: string | null; full: NonNullable<ReturnType<typeof normalizeVaryant>> }[] = [];
  for (const v of raw) {
    const o = v && typeof v === "object" ? (v as VaryantInput) : {};
    const full = normalizeVaryant(o, urunId);
    if (!full) continue;
    out.push({ uid: varyantUidFromPayload(o), full });
  }
  return out;
}

/**
 * DELETE + INSERT yerine UPSERT:
 * - uid DB'de varsa UPDATE, yoksa INSERT
 * - Formda olmayan DB varyantı: siparis_kalemleri'nde varsa stok_durumu='yok', yoksa DELETE
 */
export async function syncVaryantlarUpsert(
  sb: Sb,
  urunId: string,
  normalized: ReturnType<typeof normalizeVaryantlar>,
  yeniUrun: boolean,
) {
  if (yeniUrun) {
    if (normalized.length === 0) return;
    const { error } = await sb.from("varyantlar").insert(normalized.map((r) => r.full));
    if (error) throw error;
    return;
  }

  const { data: dbRows, error: selErr } = await sb
    .from("varyantlar")
    .select("id")
    .eq("urun_id", urunId);
  if (selErr) throw selErr;
  const dbIdSet = new Set(((dbRows ?? []) as { id: string }[]).map((r) => String(r.id)));

  const keepIds = new Set<string>();
  const toInsert: ReturnType<typeof normalizeVaryantlar>[number]["full"][] = [];

  for (const row of normalized) {
    if (row.uid && dbIdSet.has(row.uid)) {
      const { urun_id: _u, ...patch } = row.full;
      const { error: upErr } = await sb
        .from("varyantlar")
        .update(patch)
        .eq("id", row.uid)
        .eq("urun_id", urunId);
      if (upErr) throw upErr;
      keepIds.add(row.uid);
    } else {
      toInsert.push(row.full);
    }
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await sb.from("varyantlar").insert(toInsert);
    if (insErr) throw insErr;
  }

  const toRemove = [...dbIdSet].filter((id) => !keepIds.has(id));
  if (toRemove.length === 0) return;

  const { data: sipRefRows, error: sipErr } = await sb
    .from("siparis_kalemleri")
    .select("varyant_id")
    .in("varyant_id", toRemove);
  if (sipErr) throw sipErr;
  const referenced = new Set(
    ((sipRefRows ?? []) as { varyant_id?: string | null }[])
      .map((r) => r.varyant_id)
      .filter((x): x is string => typeof x === "string" && x.length > 0),
  );

  const softIds = toRemove.filter((id) => referenced.has(id));
  const hardIds = toRemove.filter((id) => !referenced.has(id));
  if (softIds.length > 0) {
    const { error } = await sb
      .from("varyantlar")
      .update({ stok_durumu: "yok" })
      .in("id", softIds)
      .eq("urun_id", urunId);
    if (error) throw error;
  }
  if (hardIds.length > 0) {
    const { error } = await sb
      .from("varyantlar")
      .delete()
      .in("id", hardIds)
      .eq("urun_id", urunId);
    if (error) throw error;
  }
}
