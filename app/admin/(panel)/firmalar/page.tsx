"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { firmaBasiIstatikler } from "@/lib/admin-aggregates";
import { firmaCoz } from "@/lib/supabase-firma";
import type { Firma } from "@/lib/types";
import { PAKET_DROPDOWN } from "@/lib/admin-paketler";
import { useAdminAuth } from "@/context/admin-auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

type Satir = Firma & {
  u: number;
  m: number;
  f: number;
};

function paketEtiket(k: string | null) {
  if (k == null) return "—";
  return PAKET_DROPDOWN.find((p) => p.value === k)?.etiket ?? k;
}

export default function AdminFirmalar() {
  const { session, ready } = useAdminAuth();
  const { show: toast } = useToast();
  const [y, setY] = useState(true);
  const [rows, setRows] = useState<Satir[]>([]);

  const yukle = useCallback(async () => {
    setY(true);
    try {
      const { data, error } = await supabase
        .from("firmalar")
        .select("*")
        .order("firma_kodu", { ascending: true });
      if (error) throw error;
      const list = (data as unknown as Record<string, unknown>[])?.map(
        (r) => firmaCoz(r),
      ) ?? [];
      const idler = list.map((l) => l.id);
      const I = await firmaBasiIstatikler(idler);
      setRows(
        list.map((firma) => {
          const s = I.get(firma.id) ?? { urun: 0, musteri: 0, fotograf: 0 };
          return { ...firma, u: s.urun, m: s.musteri, f: s.fotograf };
        }),
      );
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setY(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!ready || !session) return;
    queueMicrotask(() => {
      void yukle();
    });
  }, [ready, session, yukle]);

  if (!ready) return <LoadingScreen label="Oturum…" />;
  if (y) return <LoadingScreen label="Firmalar yükleniyor…" />;

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold text-white">Firmalar</h1>
          <p className="mt-1 text-sm text-slate-500">Tüm kayıtlı firmalar</p>
        </div>
        <Link
          href="/admin/firmalar/yeni"
          className="inline-flex justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400"
        >
          Yeni firma ekle
        </Link>
      </div>
      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Kod</th>
              <th className="px-3 py-2 font-medium">Ad</th>
              <th className="px-3 py-2 font-medium">Paket</th>
              <th className="px-3 py-2 font-medium">Ürün</th>
              <th className="px-3 py-2 font-medium">Müşteri</th>
              <th className="px-3 py-2 font-medium">Foto</th>
              <th className="px-3 py-2 font-medium">Durum</th>
              <th className="px-3 py-2 font-medium text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  Henüz firma yok.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-slate-800/80 text-slate-200"
              >
                <td className="px-3 py-2 font-mono text-xs">{r.firma_kodu}</td>
                <td className="px-3 py-2">{r.firma_adi}</td>
                <td className="px-3 py-2 text-slate-300">
                  {paketEtiket(r.aktif_paket)}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.u}</td>
                <td className="px-3 py-2 tabular-nums">{r.m}</td>
                <td className="px-3 py-2 tabular-nums">{r.f}</td>
                <td className="px-3 py-2">
                  {r.aktif ? (
                    <span className="text-emerald-400">Aktif</span>
                  ) : (
                    <span className="text-red-400/90">Pasif</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/admin/firmalar/${r.id}`}
                    className="text-amber-400/90 hover:underline"
                  >
                    Düzenle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
