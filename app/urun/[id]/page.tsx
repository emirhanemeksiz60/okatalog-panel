"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import Link from "next/link";
import { tekilRotaParam } from "@/lib/tekil-rota-param";
import { supabase } from "@/lib/supabase";
import { StokDurumuEtiket } from "@/components/StokDurumuEtiket";
import { LoadingScreen } from "@/components/LoadingScreen";
import { parseGorselUrlList } from "@/lib/gorsel-urls";
import type { Kategori, Urun, Varyant } from "@/lib/types";

function hexIcinSwatch(renkHex: string | null) {
  const t = (renkHex ?? "").trim();
  if (!t) return "#1a1a1a";
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t;
  if (t.length === 4 && t.startsWith("#")) {
    const c = t.slice(1);
    return `#${c[0]!}${c[0]!}${c[1]!}${c[1]!}${c[2]!}${c[2]!}`;
  }
  return "#1a1a1a";
}

function hexParlaklik(hex6: string): number {
  const t = hex6.replace("#", "");
  if (t.length < 6) return 0.3;
  const r = parseInt(t.slice(0, 2), 16) / 255;
  const g = parseInt(t.slice(2, 4), 16) / 255;
  const b = parseInt(t.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export default function UrunDetayKatalogPage() {
  const params = useParams();
  const id = tekilRotaParam(params.id);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [urun, setUrun] = useState<Urun | null>(null);
  const [kategoriAd, setKategoriAd] = useState<string | null>(null);
  const [varyantlar, setVaryantlar] = useState<Varyant[]>([]);
  const [secim, setSecim] = useState(0);

  const yukle = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setHata(null);
    try {
      const uRes = await supabase
        .from("urunler")
        .select(
          "id, urun_kodu, urun_adi, detay, fiyat, para_birimi, aktif, yeni_mi, guncelleme, kategori_id, varyantlar(id, renk_adi, renk_hex, gorsel_url, stok_durumu, stok_miktar, stok_birimi, min_siparis)",
        )
        .eq("id", id)
        .maybeSingle();
      if (uRes.error) throw uRes.error;
      type UrunVaryantRow = Urun & { varyantlar?: Varyant[] | null };
      const raw = uRes.data as UrunVaryantRow | null;
      if (!raw || !raw.aktif) {
        setUrun(null);
        setVaryantlar([]);
        setKategoriAd(null);
        return;
      }
      const { varyantlar: vrows, ...urunRest } = raw;
      setUrun({
        ...urunRest,
        firma_id: urunRest.firma_id ?? "",
        detay: urunRest.detay ?? null,
      } as Urun);
      const v = [...(vrows ?? [])].sort((a, b) => a.id.localeCompare(b.id));
      setVaryantlar(v);
      setSecim(0);
      const { data: kat, error: kE } = await supabase
        .from("kategoriler")
        .select("kategori_adi")
        .eq("id", u.kategori_id)
        .maybeSingle();
      if (kE) {
        setKategoriAd(null);
      } else {
        setKategoriAd((kat as Pick<Kategori, "kategori_adi"> | null)?.kategori_adi ?? null);
      }
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Yükleme hatası");
      setUrun(null);
      setVaryantlar([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      void yukle();
    });
  }, [yukle]);

  useEffect(() => {
    if (varyantlar.length === 0) {
      return;
    }
    if (secim >= varyantlar.length) {
      queueMicrotask(() => {
        setSecim(0);
      });
    }
  }, [secim, varyantlar.length]);

  if (loading) {
    return <LoadingScreen label="Ürün yükleniyor…" />;
  }
  if (hata) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-slate-50 p-4">
        <p className="text-sm text-red-600">{hata}</p>
        <Link className="mt-4 text-sm text-sky-600 underline" href="/">
          Ana sayfa
        </Link>
      </div>
    );
  }
  if (!urun) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <p className="text-slate-600">Ürün bulunamadı veya artık yayında değil.</p>
        <Link className="mt-4 text-sm text-sky-600 underline" href="/">
          Ana sayfa
        </Link>
      </div>
    );
  }

  const vSec = varyantlar[secim] ?? null;
  const gorselListe = vSec
    ? parseGorselUrlList(vSec.gorsel_url)
    : [];
  const anaGorsel = gorselListe[0];

  return (
    <div className="min-h-svh bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        {kategoriAd && (
          <p className="text-xs font-medium text-slate-500">{kategoriAd}</p>
        )}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          {urun.urun_adi}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Kod: {urun.urun_kodu}</p>
        {urun.detay && (
          <p className="mt-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
            {urun.detay}
          </p>
        )}

        <div className="mt-8">
          {anaGorsel && vSec && (
            <div className="relative mb-6 aspect-[4/3] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Image
                src={anaGorsel}
                alt={vSec.renk_adi}
                fill
                className="object-contain"
                unoptimized
                priority
                sizes="(max-width: 42rem) 100vw, 42rem"
              />
            </div>
          )}

          {varyantlar.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">Renk</p>
              <div className="flex flex-wrap gap-2">
                {varyantlar.map((v, i) => {
                  const hex = hexIcinSwatch(v.renk_hex);
                  const parlak = hexParlaklik(hex) > 0.7;
                  const yaziRengi = parlak ? "#0f172a" : "#f8fafc";
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSecim(i)}
                      className={`max-w-full rounded-lg border-2 px-2.5 py-1.5 text-left text-xs font-bold transition ${
                        secim === i
                          ? "border-sky-600 ring-2 ring-sky-200"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: hex, color: yaziRengi }}
                      title={v.renk_adi}
                    >
                      {v.renk_adi}
                    </button>
                  );
                })}
              </div>
              {vSec && (
                <div className="mt-2 space-y-1.5">
                  <StokDurumuEtiket stokDegeri={vSec.stok_durumu} />
                  {vSec.stok_miktar != null && (
                    <p className="text-sm text-slate-700">
                      {vSec.stok_miktar === 0 ? (
                        <span className="font-medium text-amber-800">
                          Stokta yok
                        </span>
                      ) : (
                        <>
                          Stok:{" "}
                          <span className="font-medium text-slate-900">
                            {vSec.stok_miktar}{" "}
                            {vSec.stok_birimi?.trim() || "adet"}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  {vSec.min_siparis != null && vSec.min_siparis > 0 && (
                    <p className="text-xs text-slate-600">
                      Min. sipariş: {vSec.min_siparis} adet
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">oKatalog</p>
      </div>
    </div>
  );
}
