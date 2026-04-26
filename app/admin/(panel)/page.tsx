"use client";

import { useCallback, useEffect, useState } from "react";
import { yuklePlatformOzet, type PlatformOzet } from "@/lib/admin-aggregates";
import { useAdminAuth } from "@/context/admin-auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function AdminDashboard() {
  const { session, ready } = useAdminAuth();
  const { show: toast } = useToast();
  const [yuk, setYuk] = useState(true);
  const [oz, setOz] = useState<PlatformOzet | null>(null);

  const yukle = useCallback(async () => {
    setYuk(true);
    try {
      setOz(await yuklePlatformOzet());
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "İstatistik alınamadı.");
    } finally {
      setYuk(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!ready || !session) return;
    queueMicrotask(() => {
      void yukle();
    });
  }, [ready, session, yukle]);

  if (!ready) {
    return <LoadingScreen label="Oturum…" />;
  }
  if (yuk || !oz) {
    return <LoadingScreen label="İstatistikler yükleniyor…" />;
  }

  const cards: { t: string; v: string | number; vurgu: string }[] = [
    { t: "Toplam firma", v: oz.toplam_firma, vurgu: "text-white" },
    { t: "Aktif firma", v: oz.aktif_firma, vurgu: "text-emerald-400" },
    { t: "Toplam ürün (tümü)", v: oz.toplam_urun, vurgu: "text-sky-300" },
    { t: "Toplam müşteri (tümü)", v: oz.toplam_musteri, vurgu: "text-violet-300" },
    { t: "Toplam fotoğraf (varyant)", v: oz.toplam_fotograf, vurgu: "text-amber-300" },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Tüm platform özeti</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.t}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow"
          >
            <p className="text-sm text-slate-400">{c.t}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${c.vurgu}`}>
              {c.v}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
