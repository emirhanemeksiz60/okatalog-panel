"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { aktiviteKaydet } from "@/lib/aktivite-logu";
import {
  type FirmaLimitBilgisi,
  limitIletisimMesaj,
  yukleFirmaLimitBilgisi,
} from "@/lib/firma-limit-usage";
import type { Kategori } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LimitBilgiCubugu } from "@/components/LimitBilgiCubugu";
import { LoadingScreen } from "@/components/LoadingScreen";

const PAGE_SIZE = 50;

function sortKategoriler(k: Kategori[]) {
  return [...k].sort((a, b) => a.sira - b.sira || a.kategori_adi.localeCompare(b.kategori_adi));
}

export default function KategorilerPage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<Kategori[]>([]);
  const [yeniAd, setYeniAd] = useState("");
  const [limitB, setLimitB] = useState<FirmaLimitBilgisi | null>(null);
  const [edits, setEdits] = useState<Record<string, { ad: string; ozel: boolean; aktif: boolean }>>(
    {},
  );
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const firmaId = session?.firma.id;

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [katRes, katCountRes, lim] = await Promise.all([
        supabase
          .from("kategoriler")
          .select("id, kategori_adi, sira, aktif, ozel, created_at")
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          .order("sira", { ascending: true }),
        supabase
          .from("kategoriler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId)
          .is("deleted_at", null),
        yukleFirmaLimitBilgisi(firmaId),
      ]);
      if (katRes.error) throw katRes.error;
      setLimitB(lim);
      setTotalCount(katCountRes.count ?? 0);
      const data = katRes.data;
      const next = sortKategoriler(
        ((data as Omit<Kategori, "firma_id">[]) ?? []).map((k) => ({
          ...k,
          firma_id: firmaId!,
        })) as Kategori[],
      );
      setList(next);
      const e: Record<string, { ad: string; ozel: boolean; aktif: boolean }> = {};
      next.forEach((k) => {
        e[k.id] = {
          ad: k.kategori_adi,
          ozel: k.ozel,
          aktif: k.aktif,
        };
      });
      setEdits(e);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Kategoriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [firmaId, page, toast]);

  useEffect(() => {
    if (!ready || !firmaId) return;
    queueMicrotask(() => {
      void load();
    });
  }, [ready, firmaId, load]);

  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    const t = yeniAd.trim();
    if (!t) {
      toast("error", "Kategori adı girin.");
      return;
    }
    if (!firmaId) return;
    try {
      const can = await yukleFirmaLimitBilgisi(firmaId);
      if (can.kullanim.kategori >= can.limits.max_kategori) {
        toast(
          "error",
          limitIletisimMesaj(
            "kategori",
            can.kullanim.kategori,
            can.limits.max_kategori,
          ),
        );
        return;
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Limit okunamadı.");
      return;
    }
    try {
      const { data: maxSiraData, error: maxSiraError } = await supabase
        .from("kategoriler")
        .select("sira")
        .eq("firma_id", firmaId)
        .is("deleted_at", null)
        .order("sira", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxSiraError) throw maxSiraError;
      const nextSira = Number((maxSiraData as { sira?: number } | null)?.sira ?? 0) + 1;
      const { data, error } = await supabase
        .from("kategoriler")
        .insert({
          firma_id: firmaId!,
          kategori_adi: t,
          sira: nextSira,
          ozel: false,
          aktif: true,
        })
        .select()
        .single();
      if (error) throw error;
      setYeniAd("");
      setList((L) => sortKategoriler([...L, data as Kategori]));
      const k = data as Kategori;
      setEdits((prev) => ({
        ...prev,
        [k.id]: { ad: k.kategori_adi, ozel: k.ozel, aktif: k.aktif },
      }));
      await aktiviteKaydet({
        firmaId,
        islem: "kategori_eklendi",
        hedefTablo: "kategoriler",
        hedefId: k.id,
        detay: { kategori_adi: t },
      });
      toast("success", "Kategori eklendi.");
      void load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Eklenemedi.");
    }
  }

  async function guncelle(k: Kategori) {
    if (k.ozel) {
      toast("error", "Otomatik filtre kategorileri düzenlenemez.");
      return;
    }
    const ed = edits[k.id];
    if (!ed) return;
    const t = ed.ad.trim();
    if (!t) {
      toast("error", "Kategori adı boş olamaz.");
      return;
    }
    try {
      const { error } = await supabase
        .from("kategoriler")
        .update({
          kategori_adi: t,
          ozel: ed.ozel,
          aktif: ed.aktif,
        })
        .eq("id", k.id)
        .eq("firma_id", firmaId);
      if (error) throw error;
      setList((L) =>
        L.map((x) =>
          x.id === k.id
            ? { ...x, kategori_adi: t, ozel: ed.ozel, aktif: ed.aktif }
            : x,
        ),
      );
      toast("success", "Güncellendi.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Güncellenemedi.");
    }
  }

  async function sil(k: Kategori) {
    if (k.ozel) {
      toast("error", "Otomatik filtre kategorileri silinemez.");
      return;
    }
    if (!window.confirm(`“${k.kategori_adi}” kategorisini silmek istiyor musunuz?`)) {
      return;
    }
    try {
      const { error } = await supabase
        .from("kategoriler")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", k.id)
        .eq("firma_id", firmaId);
      if (error) throw error;
      await aktiviteKaydet({
        firmaId,
        islem: "kategori_silindi",
        hedefTablo: "kategoriler",
        hedefId: k.id,
        detay: { kategori_adi: k.kategori_adi },
      });
      setList((L) => L.filter((x) => x.id !== k.id));
      setEdits((prev) => {
        const n = { ...prev };
        delete n[k.id];
        return n;
      });
      toast("success", "Kategori silindi.");
      void load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Silinemedi.");
    }
  }

  async function move(ordered: Kategori[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const a = ordered[i]!;
    const b = ordered[j]!;
    if (a.ozel || b.ozel) {
      toast("error", "Otomatik filtre kategorilerinin sırası değiştirilemez.");
      return;
    }
    try {
      const { error: e1 } = await supabase
        .from("kategoriler")
        .update({ sira: b.sira })
        .eq("id", a.id)
        .eq("firma_id", firmaId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("kategoriler")
        .update({ sira: a.sira })
        .eq("id", b.id)
        .eq("firma_id", firmaId);
      if (e2) throw e2;
      setList(
        sortKategoriler(
          list.map((x) => {
            if (x.id === a.id) return { ...x, sira: b.sira };
            if (x.id === b.id) return { ...x, sira: a.sira };
            return x;
          }),
        ),
      );
      toast("success", "Sıra güncellendi.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Sıra değiştirilemedi.");
    }
  }

  if (!ready || !session) {
    return <LoadingScreen />;
  }
  if (loading) {
    return <LoadingScreen label="Kategoriler yükleniyor…" />;
  }

  const ordered = sortKategoriler([...list]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Kategoriler</h1>
      <p className="mt-1 text-sm text-slate-600">Sırala, düzenle ve yeni ekle</p>
      {limitB && (
        <div className="mt-3 max-w-2xl">
          <LimitBilgiCubugu bilgi={limitB} sadece={["kategori"]} />
        </div>
      )}
      <form
        onSubmit={ekle}
        className="mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1">
          <label className="text-sm font-medium text-slate-700">Yeni kategori adı</label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            placeholder="örn. Cüzdan"
          />
        </div>
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700"
        >
          Ekle
        </button>
      </form>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Sıra</th>
              <th className="px-3 py-2 font-medium">Kategori adı</th>
              <th className="px-3 py-2 font-medium">Özel</th>
              <th className="px-3 py-2 font-medium">Aktif</th>
              <th className="w-32 px-3 py-2 font-medium">Hareket</th>
              <th className="w-32 px-3 py-2 font-medium text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((k, i) => {
              const ed = edits[k.id] ?? { ad: k.kategori_adi, ozel: k.ozel, aktif: k.aktif };
              if (k.ozel) {
                return (
                  <tr
                    key={k.id}
                    className="border-t border-slate-100 bg-slate-50/80"
                  >
                    <td className="px-3 py-2 tabular-nums text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                        <span className="font-medium text-slate-800">{k.kategori_adi}</span>
                        <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                          Otomatik filtre
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Sistem kataloğunda otomatik; ürünlere atanmaz, düzenlenemez.
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-600">Evet</td>
                    <td className="px-3 py-2 text-slate-600">{k.aktif ? "Aktif" : "Kapalı"}</td>
                    <td className="px-3 py-2 text-slate-400">—</td>
                    <td className="px-3 py-2 text-right text-xs text-slate-400">—</td>
                  </tr>
                );
              }
              return (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 tabular-nums text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full min-w-[8rem] rounded border border-slate-200 px-2 py-1.5"
                      value={ed.ad}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [k.id]: { ...ed, ad: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={ed.ozel}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [k.id]: { ...ed, ozel: e.target.checked },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={ed.aktif}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [k.id]: { ...ed, aktif: e.target.checked },
                        }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => void move(ordered, i, -1)}
                        disabled={i === 0}
                        className="rounded border border-slate-200 px-2 py-0.5 text-xs disabled:opacity-40"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => void move(ordered, i, 1)}
                        disabled={i === ordered.length - 1}
                        className="rounded border border-slate-200 px-2 py-0.5 text-xs disabled:opacity-40"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="space-x-2 px-3 py-2 text-right text-xs">
                    <button
                      type="button"
                      onClick={() => void guncelle(k)}
                      className="text-sky-600 hover:underline"
                    >
                      Kaydet
                    </button>
                    <button
                      type="button"
                      onClick={() => void sil(k)}
                      className="text-red-600 hover:underline"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  Henüz kategori yok. Yukarıdan yeni kategori ekleyin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Sayfa {page + 1} / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            Önceki
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * PAGE_SIZE >= totalCount}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
