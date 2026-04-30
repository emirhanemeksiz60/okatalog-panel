"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { sendPushNotification } from "@/lib/push-service";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

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
  const [musteriById, setMusteriById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const firmaId = session?.firma.id;

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [sRes, mRes] = await Promise.all([
        supabase
          .from("siparisler")
          .select("*")
          .eq("firma_id", firmaId)
          .order("created_at", { ascending: false }),
        supabase
          .from("musteriler")
          .select("id,musteri_adi")
          .eq("firma_id", firmaId),
      ]);
      if (sRes.error) throw sRes.error;
      if (mRes.error) throw mRes.error;
      const musteriMap: Record<string, string> = {};
      ((mRes.data as Record<string, unknown>[]) ?? []).forEach((m) => {
        const id = String(m.id ?? "");
        if (!id) return;
        musteriMap[id] = String(m.musteri_adi ?? "Müşteri");
      });
      setMusteriById(musteriMap);

      const siparisler = ((sRes.data as Record<string, unknown>[]) ?? []).map((r) => ({
        id: String(r.id ?? ""),
        firma_id: String(r.firma_id ?? ""),
        musteri_id: r.musteri_id ? String(r.musteri_id) : null,
        durum: String(r.durum ?? "istek"),
        created_at: r.created_at ? String(r.created_at) : null,
        toplam_urun_adedi: toplamAdet(r),
      }));
      setRows(siparisler);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Siparişler yüklenemedi.");
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
          await sendPushNotification(token, "oKatalog", PUSH_METIN[durum]);
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
                  {r.musteri_id ? musteriById[r.musteri_id] ?? "Bilinmeyen müşteri" : "—"}
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
    </div>
  );
}
