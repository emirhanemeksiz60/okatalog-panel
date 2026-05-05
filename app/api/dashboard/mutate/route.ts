import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getFirmaSessionIdFromRequest } from "@/lib/firma-session";
import { MUSTERI_LISTE_SUTUNLARI } from "@/lib/musteri-sutunlar";
import { createFirmaServiceRoleClient } from "@/lib/supabase-firma";

type Body = {
  tip?: string;
  tablo?: string;
  payload?: Record<string, unknown>;
};

const PARA_BIRIM = new Set(["TRY", "USD", "EUR", "GBP"]);

const URUN_PATCH_KEYS = new Set([
  "urun_kodu",
  "barkod",
  "urun_adi",
  "detay",
  "fiyat",
  "para_birimi",
  "aktif",
  "kategori_id",
  "yeni_mi",
  "guncelleme",
]);

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

  const tip = String(body.tip ?? body.tablo ?? "").trim().toLowerCase();
  const payload = body.payload ?? {};
  const action = String(payload.action ?? "").trim().toLowerCase();

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
    if (tip === "kategoriler") {
      if (action === "insert") {
        const ad = String(payload.kategori_adi ?? "").trim();
        if (!ad) {
          return NextResponse.json({ ok: false, error: "kategori_adi zorunlu." }, { status: 400 });
        }
        const { data: maxSiraData, error: maxSiraError } = await sb
          .from("kategoriler")
          .select("sira")
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .order("sira", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxSiraError) throw maxSiraError;
        const nextSira =
          Number((maxSiraData as { sira?: number } | null)?.sira ?? 0) + 1;
        const { data, error } = await sb
          .from("kategoriler")
          .insert({
            firma_id: firmaId,
            kategori_adi: ad,
            sira: nextSira,
            ozel: false,
            aktif: true,
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      if (action === "update") {
        const id = String(payload.id ?? "").trim();
        if (!id) {
          return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
        }
        const { data: row, error: rf } = await sb
          .from("kategoriler")
          .select("ozel, kategori_adi, aktif")
          .eq("id", id)
          .eq("firma_id", firmaId)
          .maybeSingle();
        if (rf) throw rf;
        if (!row || (row as { ozel?: boolean }).ozel) {
          return NextResponse.json(
            { ok: false, error: "Kategori yok veya düzenlenemez." },
            { status: 400 },
          );
        }
        const prev = row as {
          kategori_adi: string;
          aktif: boolean;
          ozel: boolean;
        };
        const kategoriAdiRaw = payload.kategori_adi;
        const t =
          typeof kategoriAdiRaw === "string" ? kategoriAdiRaw.trim() : prev.kategori_adi;
        if (!t) {
          return NextResponse.json({ ok: false, error: "kategori_adi boş olamaz." }, { status: 400 });
        }
        const upd: Record<string, unknown> = {
          kategori_adi: t,
          ozel:
            typeof payload.ozel === "boolean"
              ? payload.ozel
              : typeof payload.ozel === "string"
                ? payload.ozel.toLowerCase() === "true"
                : prev.ozel,
          aktif:
            typeof payload.aktif === "boolean"
              ? payload.aktif
              : typeof payload.aktif === "string"
                ? payload.aktif.toLowerCase() === "true"
                : prev.aktif,
        };
        const { error } = await sb
          .from("kategoriler")
          .update(upd)
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action === "softdelete") {
        const id = String(payload.id ?? "").trim();
        if (!id) {
          return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
        }
        const { data: row, error: rf } = await sb
          .from("kategoriler")
          .select("ozel")
          .eq("id", id)
          .eq("firma_id", firmaId)
          .maybeSingle();
        if (rf) throw rf;
        if (!row || (row as { ozel?: boolean }).ozel) {
          return NextResponse.json(
            { ok: false, error: "Kategori silinemez." },
            { status: 400 },
          );
        }
        const { error } = await sb
          .from("kategoriler")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action === "swap") {
        const idA = String(payload.id_a ?? payload.idA ?? "").trim();
        const idB = String(payload.id_b ?? payload.idB ?? "").trim();
        if (!idA || !idB || idA === idB) {
          return NextResponse.json(
            { ok: false, error: "id_a ve id_b zorunlu ve farklı olmalı." },
            { status: 400 },
          );
        }
        const { data: rows, error } = await sb
          .from("kategoriler")
          .select("id, sira, ozel")
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .in("id", [idA, idB]);
        if (error) throw error;
        const pair = rows as { id: string; sira: number; ozel: boolean }[];
        const aRow = pair.find((r) => r.id === idA);
        const bRow = pair.find((r) => r.id === idB);
        if (!aRow || !bRow || aRow.ozel || bRow.ozel) {
          return NextResponse.json({ ok: false, error: "Kayıtlar oluşturulamadı veya sıra kapalı." }, { status: 400 });
        }
        const e1 = await sb
          .from("kategoriler")
          .update({ sira: bRow.sira })
          .eq("id", idA)
          .eq("firma_id", firmaId);
        if (e1.error) throw e1.error;
        const e2 = await sb
          .from("kategoriler")
          .update({ sira: aRow.sira })
          .eq("id", idB)
          .eq("firma_id", firmaId);
        if (e2.error) throw e2.error;
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: false, error: "Geçersiz action (kategoriler)." }, { status: 400 });
    }

    if (tip === "musteriler") {
      if (action === "insert") {
        const k = String(payload.musteri_kodu ?? "").trim();
        const a = String(payload.musteri_adi ?? "").trim();
        const s = String(payload.sifre_plain ?? payload.sifre ?? "");
        const fiyatListeIdRaw = payload.fiyat_listesi_id;
        const fiyatListeId =
          fiyatListeIdRaw == null || String(fiyatListeIdRaw).trim() === ""
            ? null
            : String(fiyatListeIdRaw).trim();
        if (!k || !a) {
          return NextResponse.json({ ok: false, error: "musteri_kodu ve musteri_adi zorunlu." }, { status: 400 });
        }
        if (!s || s.length < 4) {
          return NextResponse.json(
            { ok: false, error: "Şifre en az 4 karakter." },
            { status: 400 },
          );
        }
        const { data: hf, error: hErr } = await sb.rpc("musteri_sifre_hash", {
          p_plain: s,
        });
        if (hErr) throw hErr;
        if (hf == null || typeof hf !== "string") {
          return NextResponse.json({ ok: false, error: "Şifre hash üretilemedi." }, { status: 500 });
        }
        const { data, error } = await sb
          .from("musteriler")
          .insert({
            firma_id: firmaId,
            musteri_kodu: k,
            musteri_adi: a,
            fiyat_listesi_id: fiyatListeId,
            sifre: hf,
            aktif: true,
          })
          .select(MUSTERI_LISTE_SUTUNLARI)
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, data });
      }

      if (action === "update") {
        const id = String(payload.id ?? "").trim();
        if (!id) return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
        const upd: Record<string, unknown> = {
          musteri_kodu: String(payload.musteri_kodu ?? "").trim(),
          musteri_adi: String(payload.musteri_adi ?? "").trim(),
          fiyat_listesi_id:
            payload.fiyat_listesi_id == null ||
            String(payload.fiyat_listesi_id).trim() === ""
              ? null
              : String(payload.fiyat_listesi_id).trim(),
          aktif: payload.aktif == null ? true : Boolean(payload.aktif),
        };
        if (!upd.musteri_kodu || !upd.musteri_adi) {
          return NextResponse.json({ ok: false, error: "musteri_kodu ve musteri_adi zorunlu." }, { status: 400 });
        }
        const sPlainRaw = payload.sifre_plain ?? payload.sifre;
        if (typeof sPlainRaw === "string" && sPlainRaw.trim().length > 0) {
          const splain = sPlainRaw.trim();
          if (splain.length < 4) {
            return NextResponse.json(
              { ok: false, error: "Şifre en az 4 karakter veya boş bırakın." },
              { status: 400 },
            );
          }
          const { data: hf, error: hErr } = await sb.rpc("musteri_sifre_hash", {
            p_plain: splain,
          });
          if (hErr) throw hErr;
          if (hf == null || typeof hf !== "string") {
            return NextResponse.json({ ok: false, error: "Şifre hash üretilemedi." }, { status: 500 });
          }
          upd.sifre = hf;
        }
        const { error } = await sb
          .from("musteriler")
          .update(upd)
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action === "sifre_guncelle") {
        const id = String(payload.id ?? "").trim();
        const sPlainRaw = payload.sifre_plain ?? payload.sifre ?? "";
        if (!id)
          return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
        const splain = typeof sPlainRaw === "string" ? sPlainRaw.trim() : "";
        if (!splain || splain.length < 4) {
          return NextResponse.json(
            { ok: false, error: "Şifre en az 4 karakter olmalı." },
            { status: 400 },
          );
        }
        const { data: hf, error: hErr } = await sb.rpc("musteri_sifre_hash", {
          p_plain: splain,
        });
        if (hErr) throw hErr;
        if (hf == null || typeof hf !== "string") {
          return NextResponse.json({ ok: false, error: "Şifre hash üretilemedi." }, { status: 500 });
        }
        const { error } = await sb
          .from("musteriler")
          .update({ sifre: hf })
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action === "softdelete") {
        const id = String(payload.id ?? "").trim();
        if (!id) return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
        const { error } = await sb
          .from("musteriler")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: false, error: "Geçersiz action (musteriler)." }, { status: 400 });
    }

    if (tip === "fiyat_listeleri") {
      const listeAdi = String(payload.liste_adi ?? "").trim();
      const paraRaw = String(payload.para_birimi ?? "TRY").trim().toUpperCase();
      if (!listeAdi) {
        return NextResponse.json({ ok: false, error: "liste_adi zorunlu." }, { status: 400 });
      }
      if (!PARA_BIRIM.has(paraRaw)) {
        return NextResponse.json({ ok: false, error: "para_birimi geçersiz." }, { status: 400 });
      }
      const ozelMid =
        payload.ozel_musteri_id == null || String(payload.ozel_musteri_id).trim() === ""
          ? null
          : String(payload.ozel_musteri_id).trim();

      if (action === "insert") {
        const rows = {
          firma_id: firmaId,
          liste_adi: listeAdi,
          aciklama:
            typeof payload.aciklama === "string" && payload.aciklama.trim()
              ? payload.aciklama.trim()
              : null,
          para_birimi: paraRaw,
          ozel_musteri_id: ozelMid,
          aktif: true,
        };
        const { data, error } = await sb
          .from("fiyat_listeleri")
          .insert(rows)
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id });
      }

      if (action === "update") {
        const id = String(payload.id ?? "").trim();
        if (!id) return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
        const rows: Record<string, unknown> = {
          liste_adi: listeAdi,
          aciklama:
            typeof payload.aciklama === "string" && payload.aciklama.trim()
              ? payload.aciklama.trim()
              : null,
          para_birimi: paraRaw,
          ozel_musteri_id: ozelMid,
        };
        if (payload.aktif != null) {
          rows.aktif = Boolean(payload.aktif);
        }
        const { error } = await sb
          .from("fiyat_listeleri")
          .update(rows)
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action === "pasifle") {
        const id = String(payload.id ?? "").trim();
        if (!id) return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
        const { error } = await sb
          .from("fiyat_listeleri")
          .update({ aktif: false })
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json(
        { ok: false, error: "Geçersiz action (fiyat_listeleri)." },
        { status: 400 },
      );
    }

    if (tip === "fiyat_liste_kalemleri") {
      if (action === "toplu_guncelle") {
        const listeId = String(payload.liste_id ?? "").trim();
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
        const rawRows = payload.rows;
        const batchInput: {
          liste_id: string;
          firma_id: string;
          urun_kodu: string;
          fiyat: number;
        }[] = [];
        if (Array.isArray(rawRows)) {
          for (const r of rawRows) {
            const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
            const kod = String(o.urun_kodu ?? "").trim();
            const fiyat = Number(o.fiyat);
            if (!kod || !Number.isFinite(fiyat)) continue;
            batchInput.push({
              liste_id: listeId,
              firma_id: firmaId,
              urun_kodu: kod,
              fiyat,
            });
          }
        }

        const { error: delErr } = await sb
          .from("fiyat_liste_kalemleri")
          .delete()
          .eq("firma_id", firmaId)
          .eq("liste_id", listeId);
        if (delErr) throw delErr;

        const CHUNK = 500;
        for (let i = 0; i < batchInput.length; i += CHUNK) {
          const piece = batchInput.slice(i, i + CHUNK);
          if (piece.length === 0) continue;
          const { error: insErr } = await sb.from("fiyat_liste_kalemleri").insert(piece);
          if (insErr) throw insErr;
        }

        return NextResponse.json({ ok: true, count: batchInput.length });
      }

      if (action === "delete") {
        const listeId = String(payload.liste_id ?? "").trim();
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
        const { error } = await sb
          .from("fiyat_liste_kalemleri")
          .delete()
          .eq("firma_id", firmaId)
          .eq("liste_id", listeId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action === "insert") {
        const rawRows = payload.rows;
        if (!Array.isArray(rawRows) || rawRows.length === 0) {
          return NextResponse.json(
            { ok: false, error: "rows boş dizilim olmalı." },
            { status: 400 },
          );
        }
        const batch = [];
        for (const r of rawRows) {
          const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
          const listeId = String(o.liste_id ?? "").trim();
          const kod = String(o.urun_kodu ?? "").trim();
          const fiyat = Number(o.fiyat);
          if (!listeId || !kod || !Number.isFinite(fiyat)) {
            return NextResponse.json(
              { ok: false, error: "Her satırda liste_id, urun_kodu, fiyat geçerli olmalı." },
              { status: 400 },
            );
          }
          const { data: liste } = await sb
            .from("fiyat_listeleri")
            .select("id")
            .eq("id", listeId)
            .eq("firma_id", firmaId)
            .maybeSingle();
          if (!liste) {
            return NextResponse.json(
              { ok: false, error: `liste_id liste firmaya ait değil: ${listeId}` },
              { status: 400 },
            );
          }
          batch.push({ liste_id: listeId, firma_id: firmaId, urun_kodu: kod, fiyat });
        }
        const { error } = await sb.from("fiyat_liste_kalemleri").insert(batch);
        if (error) throw error;
        return NextResponse.json({ ok: true, inserted: batch.length });
      }

      return NextResponse.json(
        { ok: false, error: "Geçersiz action (fiyat_liste_kalemleri)." },
        { status: 400 },
      );
    }

    if (tip === "urunler") {
      const id = String(payload.id ?? "").trim();
      if (!id) return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });

      if (action === "softdelete") {
        const { error } = await sb
          .from("urunler")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id)
          .eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      if (action === "update") {
        const patch: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(payload)) {
          if (key === "action" || key === "id") continue;
          if (!URUN_PATCH_KEYS.has(key)) continue;
          patch[key] = val;
        }
        if (Object.keys(patch).length === 0) {
          return NextResponse.json({ ok: false, error: "Geçerli alan yok." }, { status: 400 });
        }
        const { error } = await sb.from("urunler").update(patch).eq("id", id).eq("firma_id", firmaId);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ ok: false, error: "Geçersiz action (urunler)." }, { status: 400 });
    }

    if (tip === "siparisler") {
      if (action !== "durum" && action !== "durum_guncelle") {
        return NextResponse.json(
          {
            ok: false,
            error: "siparisler için payload.action: durum_guncelle veya durum",
          },
          { status: 400 },
        );
      }
      const id = String(payload.id ?? "").trim();
      const durum = String(payload.durum ?? "").trim();
      if (!id || !durum) {
        return NextResponse.json({ ok: false, error: "id ve durum zorunlu." }, { status: 400 });
      }
      const { data: sip, error: sErr } = await sb
        .from("siparisler")
        .select("musteri_id")
        .eq("id", id)
        .eq("firma_id", firmaId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!sip) {
        return NextResponse.json({ ok: false, error: "Sipariş bulunamadı." }, { status: 404 });
      }

      const { error } = await sb
        .from("siparisler")
        .update({ durum })
        .eq("id", id)
        .eq("firma_id", firmaId);
      if (error) throw error;

      let pushToken: string | null = null;
      const mid = (sip as { musteri_id?: string | null }).musteri_id;
      if (mid) {
        const { data: tok, error: tErr } = await sb
          .from("push_tokens")
          .select("token")
          .eq("musteri_id", mid)
          .maybeSingle();
        if (!tErr && tok && typeof (tok as { token?: unknown }).token === "string") {
          pushToken = String((tok as { token: string }).token).trim() || null;
        }
      }
      return NextResponse.json({ ok: true, push_token: pushToken });
    }

    if (tip === "aktivite") {
      if (action !== "kaydet") {
        return NextResponse.json({ ok: false, error: "aktivite için action: kaydet" }, { status: 400 });
      }
      const islem = String(payload.islem ?? "").trim();
      const hedefTablo = String(payload.hedef_tablo ?? payload.hedefTablo ?? "").trim();
      if (!islem || !hedefTablo) {
        return NextResponse.json(
          { ok: false, error: "islem ve hedef_tablo zorunlu." },
          { status: 400 },
        );
      }
      const kullaniciTipi = String(
        payload.kullanici_tipi ?? payload.kullaniciTipi ?? "esnaf",
      ).trim();
      const kullaniciIdRaw = payload.kullanici_id ?? payload.kullaniciId ?? null;
      const kullaniciId =
        kullaniciIdRaw == null || String(kullaniciIdRaw).trim() === ""
          ? null
          : String(kullaniciIdRaw).trim();
      const hedefIdRaw = payload.hedef_id ?? payload.hedefId ?? null;
      const hedefId =
        hedefIdRaw == null || String(hedefIdRaw).trim() === ""
          ? null
          : String(hedefIdRaw).trim();

      let detay: Record<string, unknown> | undefined;
      if (payload.detay != null && typeof payload.detay === "object") {
        detay = payload.detay as Record<string, unknown>;
      }

      const { error } = await sb.from("aktivite_logu").insert({
        firma_id: firmaId,
        kullanici_tipi: kullaniciTipi,
        kullanici_id: kullaniciId,
        islem,
        hedef_tablo: hedefTablo,
        hedef_id: hedefId,
        detay: detay ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (tip === "excel_yukle") {
      function rastgeleHexRenk(): string {
        if (typeof globalThis.crypto?.getRandomValues === "function") {
          const buf = new Uint8Array(3);
          globalThis.crypto.getRandomValues(buf);
          return `#${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
        }
        const n = Math.floor(Math.random() * 0xffffff);
        return `#${n.toString(16).toUpperCase().padStart(6, "0")}`;
      }

      const rawRows = payload.rows;
      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return NextResponse.json({ ok: false, error: "rows boş dizi olmalı." }, { status: 400 });
      }

      for (let idx = 0; idx < rawRows.length; idx += 1) {
        const item = rawRows[idx];
        const o =
          item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const ur = o.urun;
        const urPayload =
          ur && typeof ur === "object" ? (ur as Record<string, unknown>) : {};

        const kategoriId = String(
          urPayload.kategori_id ?? o.kategori_id ?? "",
        ).trim();
        const urun_kodu = String(urPayload.urun_kodu ?? o.urun_kodu ?? "").trim();
        const urun_adi = String(urPayload.urun_adi ?? "").trim();

        const existingIdRaw = o.existing_urun_id ?? o.mevcut_urun_id;
        const existingId =
          typeof existingIdRaw === "string" ? existingIdRaw.trim() : "";

        if (!urun_kodu || !urun_adi || !kategoriId) {
          return NextResponse.json(
            { ok: false, error: `Satır ${idx + 1}: kategori_id, ürün kod ve adı zorunlu.` },
            { status: 400 },
          );
        }

        const rowPayload = {
          firma_id: firmaId,
          kategori_id: kategoriId,
          urun_kodu,
          barkod:
            typeof urPayload.barkod === "string"
              ? urPayload.barkod.trim().toUpperCase() || null
              : urPayload.barkod == null
                ? null
                : String(urPayload.barkod ?? ""),
          urun_adi,
          detay: typeof urPayload.detay === "string" ? urPayload.detay : null,
          yeni_mi:
            typeof urPayload.yeni_mi === "boolean"
              ? urPayload.yeni_mi
              : typeof urPayload.yeni_mi === "string"
                ? ["true", "evet", "1", "e"].includes(String(urPayload.yeni_mi).toLowerCase())
                : Boolean(urPayload.yeni_mi),
          guncelleme:
            typeof urPayload.guncelleme === "string"
              ? urPayload.guncelleme.trim().length > 0
                ? urPayload.guncelleme.trim()
                : null
              : null,
          aktif:
            typeof urPayload.aktif === "boolean"
              ? urPayload.aktif
              : urPayload.aktif == null
                ? true
                : Boolean(urPayload.aktif),
        };

        let urunId = existingId;
        if (urunId) {
          const up = await sb
            .from("urunler")
            .update(rowPayload as Record<string, unknown>)
            .eq("id", urunId)
            .eq("firma_id", firmaId);
          if (up.error) throw up.error;
          const vDel = await sb.from("varyantlar").delete().eq("urun_id", urunId);
          if (vDel.error) throw vDel.error;
        } else {
          const ins = await sb
            .from("urunler")
            .insert(rowPayload as Record<string, unknown>)
            .select("id")
            .single();
          if (ins.error) throw ins.error;
          urunId = String((ins.data as { id?: string } | null)?.id ?? "");
          if (!urunId)
            throw new Error(`Satır ${idx + 1}: ürün oluşturulamadı.`);
        }

        const varyantKaynak = Array.isArray(o.varyantlar) ? o.varyantlar : [];
        if (varyantKaynak.length > 0) {
          const varyantPayload = varyantKaynak.map((vx) => {
            const vz = vx && typeof vx === "object" ? (vx as Record<string, unknown>) : {};
            return {
              urun_id: urunId,
              renk_adi: String(vz.renk_adi ?? "").trim(),
              renk_hex:
                typeof vz.renk_hex === "string" && vz.renk_hex.trim()
                  ? vz.renk_hex.trim()
                  : rastgeleHexRenk(),
              gorsel_url: vz.gorsel_url == null ? null : vz.gorsel_url,
              stok_durumu: vz.stok_durumu ?? "var",
              stok_miktar:
                vz.stok_miktar == null
                  ? null
                  : Number.isFinite(Number(vz.stok_miktar))
                    ? Number(vz.stok_miktar)
                    : null,
              stok_birimi: vz.stok_birimi == null ? "adet" : String(vz.stok_birimi),
              min_siparis:
                vz.min_siparis == null
                  ? null
                  : Number.isFinite(Number(vz.min_siparis))
                    ? Number(vz.min_siparis)
                    : null,
            };
          });
          const vIns = await sb.from("varyantlar").insert(varyantPayload);
          if (vIns.error) throw vIns.error;
        }
      }

      return NextResponse.json({ ok: true, imported: rawRows.length });
    }

    if (tip === "copkutusu") {
      if (action !== "gerial") {
        return NextResponse.json(
          { ok: false, error: 'copkutusu için payload.action: "geriAl"' },
          { status: 400 },
        );
      }
      const hedef = String(
        payload.hedef_tablo ??
          payload.tablo ??
          body.tablo ??
          "",
      ).trim() as "urunler" | "kategoriler" | "musteriler";
      const rowId = String(payload.id ?? "").trim();
      if (!["urunler", "kategoriler", "musteriler"].includes(hedef)) {
        return NextResponse.json(
          { ok: false, error: "hedef_tablo: urunler|kategoriler|musteriler" },
          { status: 400 },
        );
      }
      if (!rowId) {
        return NextResponse.json({ ok: false, error: "id zorunlu." }, { status: 400 });
      }
      const { error } = await sb
        .from(hedef)
        .update({ deleted_at: null })
        .eq("id", rowId)
        .eq("firma_id", firmaId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: `Geçersiz tip: ${tip}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "İşlem başarısız." },
      { status: 400 },
    );
  }
}
