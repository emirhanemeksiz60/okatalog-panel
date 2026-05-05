"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";

type AktiviteRow = {
  id: string;
  islem: string;
  detay: Record<string, unknown> | null;
  created_at: string | null;
};

const ISLEM_ETIKETLERI: Record<string, string> = {
  urun_eklendi: "✅ Ürün Eklendi",
  urun_silindi: "🗑️ Ürün Silindi",
  urun_geri_alindi: "↩️ Ürün Geri Alındı",
  kategori_eklendi: "✅ Kategori Eklendi",
  kategori_silindi: "🗑️ Kategori Silindi",
  musteri_eklendi: "✅ Müşteri Eklendi",
  musteri_silindi: "🗑️ Müşteri Silindi",
  siparis_durum_degisti: "🔄 Sipariş Durumu Değişti",
};

function detayYazisi(detay: Record<string, unknown> | null): string {
  if (!detay) return "—";
  const entries = Object.entries(detay).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
  if (entries.length === 0) return "—";
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" • ");
}

export default function AktivitePage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AktiviteRow[]>([]);

  const firmaId = session?.firma.id;

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/data?tip=aktivite", {
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; rows?: AktiviteRow[] };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Aktivite geçmişi yüklenemedi.");
      setRows(j.rows ?? []);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Aktivite geçmişi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [firmaId, toast]);

  useEffect(() => {
    if (!ready || !firmaId) return;
    queueMicrotask(() => {
      void load();
    });
  }, [ready, firmaId, load]);

  if (!ready || !session) return <LoadingScreen />;
  if (loading) return <LoadingScreen label="Aktivite geçmişi yükleniyor..." />;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Aktivite Geçmişi</h1>
      <p className="mt-1 text-sm text-slate-600">Son 100 işlem kaydı</p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Tarih/Saat</th>
              <th className="px-4 py-3 font-medium">İşlem</th>
              <th className="px-4 py-3 font-medium">Detay</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  Henüz aktivite kaydı yok.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3 text-slate-600">
                  {row.created_at ? new Date(row.created_at).toLocaleString("tr-TR") : "—"}
                </td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {ISLEM_ETIKETLERI[row.islem] ?? row.islem}
                </td>
                <td className="px-4 py-3 text-slate-600">{detayYazisi(row.detay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
