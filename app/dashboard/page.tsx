"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function DashboardHome() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    urun: number;
    kategori: number;
    musteri: number;
  } | null>(null);

  const firmaId = session?.firma.id;

  useEffect(() => {
    if (!ready || !firmaId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [u, k, m] = await Promise.all([
          supabase
            .from("urunler")
            .select("id", { count: "exact", head: true })
            .eq("firma_id", firmaId),
          supabase
            .from("kategoriler")
            .select("id", { count: "exact", head: true })
            .eq("firma_id", firmaId),
          supabase
            .from("musteriler")
            .select("id", { count: "exact", head: true })
            .eq("firma_id", firmaId),
        ]);
        if (u.error) throw u.error;
        if (k.error) throw k.error;
        if (m.error) throw m.error;
        if (!cancelled) {
          setStats({
            urun: u.count ?? 0,
            kategori: k.count ?? 0,
            musteri: m.count ?? 0,
          });
        }
      } catch (e) {
        if (!cancelled) {
          toast("error", e instanceof Error ? e.message : "Özet yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, firmaId, toast]);

  if (!ready || !session) {
    return <LoadingScreen />;
  }
  if (loading || !stats) {
    return <LoadingScreen label="Dashboard yükleniyor…" />;
  }

  const cards = [
    { label: "Toplam ürün", value: stats.urun, href: "/dashboard/urunler" },
    { label: "Kategori", value: stats.kategori, href: "/dashboard/kategoriler" },
    { label: "Müşteri", value: stats.musteri, href: "/dashboard/musteriler" },
  ] as const;

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {session.firma.firma_adi} — özet
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-200 hover:shadow"
          >
            <p className="text-sm font-medium text-slate-500">{c.label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
              {c.value}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
