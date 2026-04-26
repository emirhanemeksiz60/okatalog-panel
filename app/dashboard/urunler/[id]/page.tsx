"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { tekilRotaParam } from "@/lib/tekil-rota-param";
import { supabase } from "@/lib/supabase";
import type { Kategori, Urun, Varyant } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { UrunForm } from "@/components/UrunForm";
import { LoadingScreen } from "@/components/LoadingScreen";
import Link from "next/link";

export default function UrunDuzenlePage() {
  const params = useParams();
  const id = tekilRotaParam(params.id);
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);
  const [urun, setUrun] = useState<Urun | null>(null);
  const [varyantlar, setVaryantlar] = useState<Varyant[] | null>(null);
  const firmaId = session?.firma.id;

  useEffect(() => {
    if (!ready || !firmaId || !id) return;
    let stop = false;
    (async () => {
      setLoading(true);
      try {
        const [kRes, uRes, vRes] = await Promise.all([
          supabase
            .from("kategoriler")
            .select("*")
            .eq("firma_id", firmaId)
            .order("sira", { ascending: true }),
          supabase.from("urunler").select("*").eq("id", id).maybeSingle(),
          supabase
            .from("varyantlar")
            .select("*")
            .eq("urun_id", id)
            .order("id", { ascending: true }),
        ]);
        if (kRes.error) throw kRes.error;
        if (uRes.error) throw uRes.error;
        if (vRes.error) throw vRes.error;
        const u = uRes.data as Urun | null;
        if (!u || u.firma_id !== firmaId) {
          toast("error", "Ürün bulunamadı veya bu firmaya ait değil.");
          if (!stop) {
            setUrun(null);
            setVaryantlar([]);
            setKategoriler((kRes.data as Kategori[]) ?? []);
          }
        } else {
          if (!stop) {
            setKategoriler((kRes.data as Kategori[]) ?? []);
            setUrun(u);
            setVaryantlar((vRes.data as Varyant[]) ?? []);
          }
        }
      } catch (e) {
        if (!stop) {
          toast("error", e instanceof Error ? e.message : "Yükleme hatası.");
        }
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [ready, firmaId, id, toast]);

  if (!ready || !session) {
    return <LoadingScreen />;
  }
  if (loading) {
    return <LoadingScreen label="Ürün yükleniyor…" />;
  }
  if (!urun) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Ürün yok</h1>
        <Link href="/dashboard/urunler" className="text-sky-600 hover:underline">
          Ürün listesine dön
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        Ürün düzenle
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        {urun.urun_adi} ({urun.urun_kodu})
      </p>
      <p className="mt-2">
        <Link
          href={`/urun/${urun.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-sky-600 hover:underline"
        >
          Katalog ürün sayfası →
        </Link>
      </p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <UrunForm
          firmaId={session.firma.id}
          kategoriler={kategoriler}
          productId={urun.id}
          initialUrun={urun}
          initialVaryantlar={varyantlar ?? []}
        />
      </div>
    </div>
  );
}
