"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { aktiviteKaydet } from "@/lib/aktivite-logu";
import type { Kategori, Urun } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

const PAGE_SIZE = 50;

function statusLabel(u: Urun): { text: string; className: string } {
  if (u.yeni_mi) {
    return { text: "Yeni", className: "bg-emerald-100 text-emerald-800" };
  }
  if (u.guncelleme && u.guncelleme.trim().length > 0) {
    return { text: "Güncellendi", className: "bg-sky-100 text-sky-800" };
  }
  return { text: "—", className: "bg-slate-100 text-slate-600" };
}

export default function UrunlerPage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Urun[]>([]);
  const [katById, setKatById] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const firmaId = session?.firma.id;

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [kRes, uRes, uCountRes] = await Promise.all([
        supabase
          .from("kategoriler")
          .select("id, kategori_adi")
          .eq("firma_id", firmaId),
        supabase
          .from("urunler")
          .select("*")
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          .order("urun_kodu", { ascending: true }),
        supabase
          .from("urunler")
          .select("*", { count: "exact", head: true })
          .eq("firma_id", firmaId)
          .is("deleted_at", null)
          .order("urun_kodu", { ascending: true }),
      ]);
      if (kRes.error) throw kRes.error;
      if (uRes.error) throw uRes.error;
      const m: Record<string, string> = {};
      (kRes.data as Pick<Kategori, "id" | "kategori_adi">[]).forEach((k) => {
        m[k.id] = k.kategori_adi;
      });
      setKatById(m);
      setRows((uRes.data as Urun[]) ?? []);
      setTotalCount(uCountRes.count ?? 0);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Ürünler yüklenemedi.");
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

  async function remove(ur: Urun) {
    if (
      !window.confirm(
        `“${ur.urun_adi}” ürünü silinecek. Emin misiniz?`,
      )
    ) {
      return;
    }
    try {
      const d2 = await supabase
        .from("urunler")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", ur.id)
        .eq("firma_id", firmaId);
      if (d2.error) throw d2.error;
      await aktiviteKaydet({
        firmaId,
        islem: "urun_silindi",
        hedefTablo: "urunler",
        hedefId: ur.id,
        detay: { urun_adi: ur.urun_adi },
      });
      toast("success", "Ürün silindi.");
      setRows((r) => r.filter((x) => x.id !== ur.id));
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Silinemedi.");
    }
  }

  if (!ready || !session) {
    return <LoadingScreen />;
  }
  if (loading) {
    return <LoadingScreen label="Ürünler yükleniyor…" />;
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Ürünler
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Katalogdaki tüm ürünler
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/urunler/excel-yukle"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <span aria-hidden="true">📗</span>
            Excel ile toplu yükle
          </Link>
          <Link
            href="/dashboard/urunler/ekle"
            className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Yeni ürün ekle
          </Link>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Kod</th>
              <th className="px-4 py-3 font-medium">Barkod</th>
              <th className="px-4 py-3 font-medium">Ad</th>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="w-32 px-4 py-3 font-medium text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  Henüz ürün yok. &quot;Yeni ürün ekle&quot; ile başlayın.
                </td>
              </tr>
            )}
            {rows.map((u) => {
              const s = statusLabel(u);
              return (
                <tr
                  key={u.id}
                  className="border-t border-slate-100 bg-white hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3 font-mono text-slate-800">
                    {u.urun_kodu}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {u.barkod?.trim() || "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    <Link
                      href={`/dashboard/urunler/${u.id}`}
                      className="text-sky-700 hover:underline"
                    >
                      {u.urun_adi}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {katById[u.kategori_id] ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.className}`}
                    >
                      {s.text}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(u)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              );
            })}
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
