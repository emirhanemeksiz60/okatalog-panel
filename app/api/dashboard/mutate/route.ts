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

      return NextResponse.json(
        { ok: false, error: "Geçersiz action (fiyat_listeleri)." },
        { status: 400 },
      );
    }

    if (tip === "fiyat_liste_kalemleri") {
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
      if (action !== "durum") {
        return NextResponse.json(
          { ok: false, error: "siparisler için action: durum" },
          { status: 400 },
        );
      }
      const id = String(payload.id ?? "").trim();
      const durum = String(payload.durum ?? "").trim();
      if (!id || !durum) {
        return NextResponse.json({ ok: false, error: "id ve durum zorunlu." }, { status: 400 });
      }
      const { error } = await sb
        .from("siparisler")
        .update({ durum })
        .eq("id", id)
        .eq("firma_id", firmaId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
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
