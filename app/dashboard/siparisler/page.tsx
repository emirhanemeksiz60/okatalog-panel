"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { aktiviteKaydet } from "@/lib/aktivite-logu";
import { sendPushNotification } from "@/lib/push-service";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

const PAGE_SIZE = 50;

type SiparisDurum =
  | "istek"
  | "duzenlendi"
  | "onaylandi"
  | "hazirlaniyor"
  | "gonderildi"
  | "reddedildi";

type SiparisRow = {
  id: string;
  firma_id: string;
  musteri_id: string | null;
  musteri_adi: string | null;
  durum: SiparisDurum | string;
  created_at: string | null;
  toplam_urun_adedi: number;
};

const DURUMLAR: SiparisDurum[] = [
  "istek",
  "duzenlendi",
  "onaylandi",
  "hazirlaniyor",
  "gonderildi",
  "reddedildi",
];

const PUSH_METIN: Record<string, string> = {
  onaylandi: "Siparişiniz onaylandı ✅",
  hazirlaniyor: "Siparişiniz hazırlanıyor 📦",
  gonderildi: "Siparişiniz kargoya verildi 🚚",
  reddedildi: "Siparişiniz reddedildi ❌",
};

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

export default function SiparislerPage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SiparisRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const firmaId = session?.firma.id;

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [sRes, sCountRes] = await Promise.all([
        supabase
          .from("siparisler")
          .select(
            "id, firma_id, durum, created_at, updated_at, notlar, esnaf_notu, kargo_notu, toplam_urun, musteri_id, musteriler(id, musteri_adi, musteri_kodu)",
          )
          .eq("firma_id", firmaId)
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          .order("created_at", { ascending: false }),
        supabase
          .from("siparisler")
          .select("id", { count: "exact", head: true })
          .eq("firma_id", firmaId),
      ]);
      if (sRes.error) throw sRes.error;
      setTotalCount(sCountRes.count ?? 0);

      const siparisler = ((sRes.data as Record<string, unknown>[]) ?? []).map((r) => {
        const m = r.musteriler as { musteri_adi?: string } | null | undefined;
        return {
          id: String(r.id ?? ""),
          firma_id: String(r.firma_id ?? firmaId),
          musteri_id: r.musteri_id ? String(r.musteri_id) : null,
          musteri_adi: m?.musteri_adi ? String(m.musteri_adi) : null,
          durum: String(r.durum ?? "istek"),
          created_at: r.created_at ? String(r.created_at) : null,
          toplam_urun_adedi: toplamAdet(r),
        };
      });
      setRows(siparisler);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Siparişler yüklenemedi.");
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

  const sortedRows = useMemo(() => rows, [rows]);

  async function durumDegistir(row: SiparisRow, durum: SiparisDurum) {
    if (!firmaId) return;
    setSavingId(row.id);
    try {
      const { data: updData, error } = await supabase
        .from("siparisler")
        .update({ durum })
        .eq("id", row.id)
        .eq("firma_id", firmaId)
        .select("id,durum")
        .maybeSingle();
      if (error) throw error;
      await aktiviteKaydet({
        firmaId,
        islem: "siparis_durum_degisti",
        hedefTablo: "siparisler",
        hedefId: row.id,
        detay: { eski_durum: row.durum, yeni_durum: durum },
      });

      setRows((prev) =>
        prev.map((x) => (x.id === row.id ? { ...x, durum } : x)),
      );

      if (row.musteri_id && PUSH_METIN[durum]) {
        const { data, error: tErr } = await supabase
          .from("push_tokens")
          .select("token")
          .eq("musteri_id", row.musteri_id)
          .maybeSingle();
        if (tErr) {
          // Sipariş durumu güncellendi; token sorgu hatası push adımını bozmasın.
        }

        const token = (data as { token?: string } | null)?.token ?? null;
        if (typeof token === "string" && token.trim()) {
          await sendPushNotification(firmaId, token, "oKatalog", PUSH_METIN[durum]);
        }
      }

      toast("success", "Sipariş durumu güncellendi.");
    } catch (e) {
      const err = e as { message?: string; code?: string };
      toast("error", e instanceof Error ? e.message : "Durum güncellenemedi.");
    } finally {
      setSavingId(null);
    }
  }

  if (!ready || !session) return <LoadingScreen />;
  if (loading) return <LoadingScreen label="Siparişler yükleniyor..." />;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Siparişler</h1>
      <p className="mt-1 text-sm text-slate-600">
        Müşteri siparişleri ve durum yönetimi
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Müşteri</th>
              <th className="px-4 py-3 font-medium">Sipariş Tarihi</th>
              <th className="px-4 py-3 font-medium">Durum</th>
              <th className="px-4 py-3 font-medium">Toplam Ürün Adedi</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Henüz sipariş yok.
                </td>
              </tr>
            )}
            {sortedRows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  {r.musteri_id ? r.musteri_adi ?? "Bilinmeyen müşteri" : "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {r.created_at
                    ? new Date(r.created_at).toLocaleString("tr-TR")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={DURUMLAR.includes(r.durum as SiparisDurum) ? r.durum : "istek"}
                    disabled={savingId === r.id}
                    onChange={(e) => void durumDegistir(r, e.target.value as SiparisDurum)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
                  >
                    {DURUMLAR.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 font-medium tabular-nums">{r.toplam_urun_adedi}</td>
              </tr>
            ))}
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
