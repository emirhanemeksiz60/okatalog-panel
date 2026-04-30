"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { aktiviteKaydet } from "@/lib/aktivite-logu";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

type TabKey = "urunler" | "kategoriler" | "musteriler";

type SilinenUrun = {
  id: string;
  urun_kodu: string;
  urun_adi: string;
  deleted_at: string | null;
};

type SilinenKategori = {
  id: string;
  kategori_adi: string;
  deleted_at: string | null;
};

type SilinenMusteri = {
  id: string;
  musteri_kodu: string;
  musteri_adi: string;
  deleted_at: string | null;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "urunler", label: "Ürünler" },
  { key: "kategoriler", label: "Kategoriler" },
  { key: "musteriler", label: "Müşteriler" },
];

export default function CopKutusuPage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [tab, setTab] = useState<TabKey>("urunler");
  const [loading, setLoading] = useState(true);
  const [urunler, setUrunler] = useState<SilinenUrun[]>([]);
  const [kategoriler, setKategoriler] = useState<SilinenKategori[]>([]);
  const [musteriler, setMusteriler] = useState<SilinenMusteri[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const firmaId = session?.firma.id;

  const otuzGunOnceIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [uRes, kRes, mRes] = await Promise.all([
        supabase
          .from("urunler")
          .select("id, urun_kodu, urun_adi, deleted_at")
          .eq("firma_id", firmaId)
          .not("deleted_at", "is", null)
          .gte("deleted_at", otuzGunOnceIso)
          .order("deleted_at", { ascending: false }),
        supabase
          .from("kategoriler")
          .select("id, kategori_adi, deleted_at")
          .eq("firma_id", firmaId)
          .not("deleted_at", "is", null)
          .gte("deleted_at", otuzGunOnceIso)
          .order("deleted_at", { ascending: false }),
        supabase
          .from("musteriler")
          .select("id, musteri_kodu, musteri_adi, deleted_at")
          .eq("firma_id", firmaId)
          .not("deleted_at", "is", null)
          .gte("deleted_at", otuzGunOnceIso)
          .order("deleted_at", { ascending: false }),
      ]);

      if (uRes.error) throw uRes.error;
      if (kRes.error) throw kRes.error;
      if (mRes.error) throw mRes.error;

      setUrunler((uRes.data as SilinenUrun[]) ?? []);
      setKategoriler((kRes.data as SilinenKategori[]) ?? []);
      setMusteriler((mRes.data as SilinenMusteri[]) ?? []);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Çöp kutusu yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [firmaId, otuzGunOnceIso, toast]);

  useEffect(() => {
    if (!ready || !firmaId) return;
    queueMicrotask(() => {
      void load();
    });
  }, [ready, firmaId, load]);

  async function geriAl(table: "urunler" | "kategoriler" | "musteriler", id: string) {
    if (!firmaId) return;
    setRestoringId(id);
    try {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: null })
        .eq("id", id)
        .eq("firma_id", firmaId);
      if (error) throw error;
      if (table === "urunler") {
        const ur = urunler.find((x) => x.id === id);
        await aktiviteKaydet({
          firmaId,
          islem: "urun_geri_alindi",
          hedefTablo: "urunler",
          hedefId: id,
          detay: ur ? { urun_adi: ur.urun_adi } : undefined,
        });
      }
      toast("success", "Kayıt geri alındı.");
      await load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Geri alma başarısız.");
    } finally {
      setRestoringId(null);
    }
  }

  if (!ready || !session) return <LoadingScreen />;
  if (loading) return <LoadingScreen label="Çöp kutusu yükleniyor…" />;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Çöp Kutusu</h1>
      <p className="mt-1 text-sm text-slate-600">Son 30 günde silinen kayıtlar</p>

      <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.key ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {tab === "urunler" && (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Ad</th>
                <th className="px-4 py-3 font-medium">Silinme Tarihi</th>
                <th className="w-32 px-4 py-3 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {urunler.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Son 30 günde silinen kayıt yok
                  </td>
                </tr>
              )}
              {urunler.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-slate-800">{u.urun_kodu}</td>
                  <td className="px-4 py-3 text-slate-800">{u.urun_adi}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {u.deleted_at ? new Date(u.deleted_at).toLocaleString("tr-TR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void geriAl("urunler", u.id)}
                      disabled={restoringId === u.id}
                      className="text-sm text-sky-600 hover:underline disabled:opacity-50"
                    >
                      Geri Al
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "kategoriler" && (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Kategori</th>
                <th className="px-4 py-3 font-medium">Silinme Tarihi</th>
                <th className="w-32 px-4 py-3 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {kategoriler.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    Son 30 günde silinen kayıt yok
                  </td>
                </tr>
              )}
              {kategoriler.map((k) => (
                <tr key={k.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800">{k.kategori_adi}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {k.deleted_at ? new Date(k.deleted_at).toLocaleString("tr-TR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void geriAl("kategoriler", k.id)}
                      disabled={restoringId === k.id}
                      className="text-sm text-sky-600 hover:underline disabled:opacity-50"
                    >
                      Geri Al
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "musteriler" && (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Ad</th>
                <th className="px-4 py-3 font-medium">Silinme Tarihi</th>
                <th className="w-32 px-4 py-3 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {musteriler.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Son 30 günde silinen kayıt yok
                  </td>
                </tr>
              )}
              {musteriler.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono text-slate-800">{m.musteri_kodu}</td>
                  <td className="px-4 py-3 text-slate-800">{m.musteri_adi}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {m.deleted_at ? new Date(m.deleted_at).toLocaleString("tr-TR") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void geriAl("musteriler", m.id)}
                      disabled={restoringId === m.id}
                      className="text-sm text-sky-600 hover:underline disabled:opacity-50"
                    >
                      Geri Al
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
