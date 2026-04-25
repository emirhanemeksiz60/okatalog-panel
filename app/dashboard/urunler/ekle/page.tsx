"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Kategori } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { UrunForm } from "@/components/UrunForm";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function UrunEklePage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);
  const firmaId = session?.firma.id;

  useEffect(() => {
    if (!ready || !firmaId) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("kategoriler")
          .select("*")
          .eq("firma_id", firmaId)
          .order("sira", { ascending: true });
        if (error) throw error;
        setKategoriler((data as Kategori[]) ?? []);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Kategoriler yüklenemedi.");
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, firmaId, toast]);

  if (!ready || !session) {
    return <LoadingScreen />;
  }
  if (loading) {
    return <LoadingScreen label="Yükleniyor…" />;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
        Yeni ürün
      </h1>
      <p className="mt-1 text-sm text-slate-600">Ürün ve varyant bilgileri</p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <UrunForm
          firmaId={session.firma.id}
          kategoriler={kategoriler}
          productId={null}
          initialUrun={null}
          initialVaryantlar={[]}
        />
      </div>
    </div>
  );
}
