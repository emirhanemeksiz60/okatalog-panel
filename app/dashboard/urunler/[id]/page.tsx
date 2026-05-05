"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { tekilRotaParam } from "@/lib/tekil-rota-param";
import { type FirmaLimitBilgisi, yukleFirmaLimitBilgisi } from "@/lib/firma-limit-usage";
import type { Kategori, Urun, Varyant } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { UrunForm } from "@/components/UrunForm";
import { LimitBilgiCubugu } from "@/components/LimitBilgiCubugu";
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
  const [limitB, setLimitB] = useState<FirmaLimitBilgisi | null>(null);
  const firmaId = session?.firma.id;

  useEffect(() => {
    if (!ready || !firmaId || !id) return;
    let stop = false;
    (async () => {
      setLoading(true);
      try {
        const [detailRes, limRes] = await Promise.all([
          fetch(
            `/api/dashboard/data?tip=urun_detay&id=${encodeURIComponent(id)}`,
            { credentials: "include" },
          ),
          yukleFirmaLimitBilgisi(firmaId),
        ]);
        const dj = (await detailRes.json()) as {
          ok?: boolean;
          error?: string;
          kategoriler?: Kategori[];
          urun?: Urun | null;
          varyantlar?: Varyant[];
        };
        if (!stop) {
          setLimitB(limRes);
        }
        if (!detailRes.ok || !dj.ok) {
          throw new Error(dj.error ?? "Veri alınamadı.");
        }
        const u = (dj.urun as Urun | null) ?? null;
        if (!u || u.firma_id !== firmaId) {
          toast("error", "Ürün bulunamadı veya bu firmaya ait değil.");
          if (!stop) {
            setUrun(null);
            setVaryantlar([]);
            setKategoriler(dj.kategoriler ?? []);
          }
        } else {
          if (!stop) {
            setKategoriler(dj.kategoriler ?? []);
            setUrun(u);
            setVaryantlar(dj.varyantlar ?? []);
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
  if (urun && !limitB) {
    return <LoadingScreen label="Limit bilgisi yükleniyor…" />;
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
      {limitB && (
        <div className="mt-3">
          <LimitBilgiCubugu bilgi={limitB} sadece={["urun", "fotograf"]} />
        </div>
      )}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {limitB && (
          <UrunForm
            firmaId={session.firma.id}
            kategoriler={kategoriler}
            productId={urun.id}
            initialUrun={urun}
            initialVaryantlar={varyantlar ?? []}
            limitBilgisi={limitB}
            yeniUrunEkle={false}
          />
        )}
      </div>
    </div>
  );
}
