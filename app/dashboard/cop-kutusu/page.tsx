"use client";

import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/data?tip=copkutusu", {
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        urunler?: SilinenUrun[];
        kategoriler?: SilinenKategori[];
        musteriler?: SilinenMusteri[];
      };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Çöp kutusu yüklenemedi.");

      setUrunler(j.urunler ?? []);
      setKategoriler(j.kategoriler ?? []);
      setMusteriler(j.musteriler ?? []);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Çöp kutusu yüklenemedi.");
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

  async function geriAl(table: "urunler" | "kategoriler" | "musteriler", id: string) {
    if (!firmaId) return;
    setRestoringId(id);
    try {
      const res = await fetch("/api/dashboard/mutate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "copkutusu",
          tablo: table,
          payload: { action: "geriAl", hedef_tablo: table, id },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Geri alma başarısız.");
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
