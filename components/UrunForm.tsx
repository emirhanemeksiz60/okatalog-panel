"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  STOK_DURUMU_SECENEKLERI,
  STOK_DURUMU_VARSAYILAN,
  stokDegeriToKod,
  type StokKodu,
} from "@/lib/stok-durumu";
import type { Kategori, Urun, Varyant } from "@/lib/types";
import { gorselUrlListToAlan, parseGorselUrlList } from "@/lib/gorsel-urls";
import {
  type FirmaLimitBilgisi,
  limitFotografMesaj,
  limitIletisimMesaj,
} from "@/lib/firma-limit-usage";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";
import { VariantFotoYukle } from "@/components/VariantFotoYukle";

const STOK_BIRIMI_SECENEKLERI = [
  "adet",
  "düzine",
  "kutu",
  "çift",
  "paket",
  "koli",
] as const;

type VaryantDraft = {
  id?: string;
  key: string;
  renk_adi: string;
  /** Önizleme ve düzen; kayıtta virgüllü `gorsel_url` alanı */
  gorselUrls: string[];
  stok_durumu: StokKodu;
  /** Boş = veritabanına null */
  stokMiktarStr: string;
  stokBirimi: (typeof STOK_BIRIMI_SECENEKLERI)[number];
  minSiparisStr: string;
};

function parseOptionalInt(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  if (Number.isNaN(n)) return null;
  return n;
}

function newDraft(): VaryantDraft {
  return {
    key: `v-${Date.now()}-${Math.random()}`,
    renk_adi: "",
    gorselUrls: [],
    stok_durumu: STOK_DURUMU_VARSAYILAN,
    stokMiktarStr: "",
    stokBirimi: "adet",
    minSiparisStr: "",
  };
}

/** Veritabanı alanı; panelde gösterilmez, kayıtta rastgele üretilir */
function rastgeleHexRenk(): string {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(3);
    globalThis.crypto.getRandomValues(buf);
    return `#${[...buf].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  const n = Math.floor(Math.random() * 0x1000000);
  return `#${n.toString(16).toUpperCase().padStart(6, "0")}`;
}

type Props = {
  firmaId: string;
  kategoriler: Kategori[];
  productId: string | null;
  initialUrun?: Urun | null;
  initialVaryantlar: Varyant[] | null;
  onSaveRedirect?: string;
  /** Firma sınır + güncel kullanım; listeler `yukleFirmaLimitBilgisi` */
  limitBilgisi: FirmaLimitBilgisi;
  /** Yeni ürün kaydı: ürün adedi +1 sınırı uygulanır. */
  yeniUrunEkle: boolean;
};

function toplamFormFoto(vers: VaryantDraft[]): number {
  return vers.reduce((s, v) => s + v.gorselUrls.length, 0);
}

function toplamDbVaryantFoto(vers: Varyant[] | null): number {
  if (!vers || vers.length === 0) return 0;
  return vers.reduce(
    (s, v) => s + parseGorselUrlList(v.gorsel_url).length,
    0,
  );
}

export function UrunForm({
  firmaId,
  kategoriler,
  productId,
  initialUrun,
  initialVaryantlar,
  onSaveRedirect = "/dashboard/urunler",
  limitBilgisi,
  yeniUrunEkle,
}: Props) {
  const { show: toast } = useToast();
  const router = useRouter();
  const kategorilerUrunIcin = useMemo(
    () => kategoriler.filter((k) => k.aktif && !k.ozel),
    [kategoriler],
  );
  const [saving, setSaving] = useState(false);
  const [urunKodu, setUrunKodu] = useState(initialUrun?.urun_kodu ?? "");
  const [urunAdi, setUrunAdi] = useState(initialUrun?.urun_adi ?? "");
  const [detay, setDetay] = useState(initialUrun?.detay ?? "");
  const [kategoriId, setKategoriId] = useState(() => {
    const k = kategoriler.filter((x) => x.aktif && !x.ozel);
    if (
      initialUrun?.kategori_id &&
      k.some((x) => x.id === initialUrun.kategori_id)
    ) {
      return initialUrun.kategori_id;
    }
    return k[0]?.id ?? "";
  });
  const [yeniMi, setYeniMi] = useState(initialUrun?.yeni_mi ?? true);
  const [guncelleme, setGuncelleme] = useState(
    initialUrun?.guncelleme ?? "",
  );
  const [aktif, setAktif] = useState(initialUrun?.aktif ?? true);

  useEffect(() => {
    if (kategorilerUrunIcin.length === 0) return;
    if (kategorilerUrunIcin.some((c) => c.id === kategoriId)) return;
    queueMicrotask(() => {
      setKategoriId(kategorilerUrunIcin[0]!.id);
    });
  }, [kategorilerUrunIcin, kategoriId]);

  const [variants, setVariants] = useState<VaryantDraft[]>(() => {
    if (initialVaryantlar && initialVaryantlar.length > 0) {
      return initialVaryantlar.map((v) => {
        const birimRaw = v.stok_birimi ?? "adet";
        const birim = STOK_BIRIMI_SECENEKLERI.includes(
          birimRaw as (typeof STOK_BIRIMI_SECENEKLERI)[number],
        )
          ? (birimRaw as (typeof STOK_BIRIMI_SECENEKLERI)[number])
          : "adet";
        return {
        id: v.id,
        key: v.id,
        renk_adi: v.renk_adi,
        gorselUrls: parseGorselUrlList(v.gorsel_url),
        stok_durumu: stokDegeriToKod(v.stok_durumu),
        stokMiktarStr:
          v.stok_miktar == null || Number.isNaN(v.stok_miktar)
            ? ""
            : String(v.stok_miktar),
        stokBirimi: birim,
        minSiparisStr:
          v.min_siparis == null || Number.isNaN(v.min_siparis)
            ? ""
            : String(v.min_siparis),
        };
      });
    }
    return [newDraft()];
  });

  function fotoCevreKayitIcin(
    form: VaryantDraft[],
    eklenecek: number = 0,
  ): { ok: boolean; sonToplam: number; maks: number } {
    const maksF = limitBilgisi.limits.max_fotograf;
    if (yeniUrunEkle) {
      const t = limitBilgisi.kullanim.fotograf + toplamFormFoto(form) + eklenecek;
      return { ok: t <= maksF, sonToplam: t, maks: maksF };
    }
    const buUrunEskiFoto = toplamDbVaryantFoto(initialVaryantlar);
    const t =
      limitBilgisi.kullanim.fotograf -
      buUrunEskiFoto +
      toplamFormFoto(form) +
      eklenecek;
    return { ok: t <= maksF, sonToplam: t, maks: maksF };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!kategoriId) {
      toast("error", "Bir kategori seçin.");
      return;
    }
    if (yeniUrunEkle) {
      const m = limitBilgisi.limits;
      if (limitBilgisi.kullanim.urun >= m.max_urun) {
        toast(
          "error",
          limitIletisimMesaj(
            "urun",
            limitBilgisi.kullanim.urun,
            m.max_urun,
          ),
        );
        return;
      }
    }
    if (!fotoCevreKayitIcin(variants, 0).ok) {
      const r = fotoCevreKayitIcin(variants, 0);
      toast("error", limitFotografMesaj(r.sonToplam, r.maks));
      return;
    }
    const filled = (v: VaryantDraft) =>
      v.renk_adi.trim().length > 0 || v.gorselUrls.length > 0;
    const rows = variants.filter(filled);
    for (const v of rows) {
      if (!v.renk_adi.trim()) {
        toast(
          "error",
          "Doldurulmuş her varyant için renk adı gerekli. Boş bırakın veya doldurun.",
        );
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        firma_id: firmaId,
        kategori_id: kategoriId,
        urun_kodu: urunKodu.trim(),
        urun_adi: urunAdi.trim(),
        detay: detay.trim() || null,
        yeni_mi: yeniMi,
        guncelleme: guncelleme.trim() || null,
        aktif,
      };

      let uid = productId;
      if (uid) {
        const { error } = await supabase
          .from("urunler")
          .update(payload)
          .eq("id", uid);
        if (error) throw error;
        const { error: dErr } = await supabase
          .from("varyantlar")
          .delete()
          .eq("urun_id", uid);
        if (dErr) throw dErr;
      } else {
        const { data, error } = await supabase
          .from("urunler")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        uid = data?.id;
      }

      if (!uid) {
        throw new Error("Ürün kaydedilemedi.");
      }

      const toInsert = rows.map((v) => ({
        urun_id: uid!,
        renk_adi: v.renk_adi.trim(),
        renk_hex: rastgeleHexRenk(),
        gorsel_url: (() => {
          const s = gorselUrlListToAlan(v.gorselUrls);
          return s.length > 0 ? s : null;
        })(),
        stok_durumu: stokDegeriToKod(v.stok_durumu),
        stok_miktar: parseOptionalInt(v.stokMiktarStr),
        stok_birimi: v.stokBirimi,
        min_siparis: parseOptionalInt(v.minSiparisStr),
      }));

      if (toInsert.length) {
        const { error: vErr } = await supabase
          .from("varyantlar")
          .insert(toInsert);
        if (vErr) throw vErr;
      }

      toast("success", "Ürün kaydedildi.");
      router.push(onSaveRedirect);
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Kayıt başarısız.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (saving) {
    return <LoadingScreen label="Kaydediliyor…" />;
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Ürün kodu
          </label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={urunKodu}
            onChange={(e) => setUrunKodu(e.target.value)}
            required
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Ürün adı
          </label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={urunAdi}
            onChange={(e) => setUrunAdi(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Kategori
        </label>
        <select
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={kategoriId}
          onChange={(e) => setKategoriId(e.target.value)}
          required
        >
          <option value="" disabled>
            Kategori seçin
          </option>
          {kategorilerUrunIcin.map((k) => (
            <option key={k.id} value={k.id}>
              {k.kategori_adi}
            </option>
          ))}
        </select>
        {kategorilerUrunIcin.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            Seçilebilir kategori yok.{" "}
            <Link
              className="underline"
              href="/dashboard/kategoriler"
            >
              Kategoriler
            </Link>{" "}
            sayfasında &quot;gerçek&quot; (otomatik filtre olmayan) kategori
            ekleyin.
          </p>
        )}
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Detay
        </label>
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={detay}
          onChange={(e) => setDetay(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={yeniMi}
            onChange={(e) => setYeniMi(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Yeni ürün
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={aktif}
            onChange={(e) => setAktif(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Listede aktif
        </label>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Güncelleme notu
        </label>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={guncelleme}
          onChange={(e) => setGuncelleme(e.target.value)}
          placeholder="Örn. fiyat / beden / renk eklendi"
        />
      </div>

      <div className="border-t border-slate-200 pt-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-slate-900">Varyantlar</h2>
          <button
            type="button"
            onClick={() => setVariants((r) => [...r, newDraft()])}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-200"
          >
            + Varyant ekle
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          Her satırda renk, Cloudinary’e fotoğraf (birden çok) ve stok. Aynı ürün
          için birden fazla varyant satırı ekleyin.
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Stok bilgisi opsiyoneldir. Müşterileriniz ürün detayında stok durumunu
          görecektir.
        </p>
        <div className="space-y-4">
          {variants.map((v, i) => {
            const stokMiktarSayi = parseOptionalInt(v.stokMiktarStr);
            const stokSifirGoster =
              v.stokMiktarStr.trim() !== "" && stokMiktarSayi === 0;
            return (
            <div
              key={v.key}
              className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
                <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                  <label
                    className="text-xs text-slate-500"
                    htmlFor={`v-renk-${v.key}`}
                  >
                    Renk adı
                  </label>
                  <input
                    id={`v-renk-${v.key}`}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm"
                    value={v.renk_adi}
                    onChange={(e) => {
                      setVariants((rows) => {
                        const next = [...rows];
                        next[i] = { ...next[i]!, renk_adi: e.target.value };
                        return next;
                      });
                    }}
                    placeholder="Örn. Siyah, Lacivert - Kırmızı - Beyaz"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    className="text-xs text-slate-500"
                    htmlFor={`v-stok-miktar-${v.key}`}
                  >
                    Stok miktarı
                  </label>
                  <input
                    id={`v-stok-miktar-${v.key}`}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm"
                    value={v.stokMiktarStr}
                    onChange={(e) => {
                      setVariants((rows) => {
                        const next = [...rows];
                        next[i] = { ...next[i]!, stokMiktarStr: e.target.value };
                        return next;
                      });
                    }}
                    type="text"
                    inputMode="numeric"
                    placeholder="Opsiyonel"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    className="text-xs text-slate-500"
                    htmlFor={`v-stok-birim-${v.key}`}
                  >
                    Stok birimi
                  </label>
                  <select
                    id={`v-stok-birim-${v.key}`}
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm"
                    value={v.stokBirimi}
                    onChange={(e) => {
                      setVariants((rows) => {
                        const next = [...rows];
                        const val = e.target.value;
                        next[i] = {
                          ...next[i]!,
                          stokBirimi: (STOK_BIRIMI_SECENEKLERI.includes(
                            val as (typeof STOK_BIRIMI_SECENEKLERI)[number],
                          )
                            ? val
                            : "adet") as (typeof STOK_BIRIMI_SECENEKLERI)[number],
                        };
                        return next;
                      });
                    }}
                  >
                    {STOK_BIRIMI_SECENEKLERI.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className="text-xs text-slate-500"
                    htmlFor={`v-min-siparis-${v.key}`}
                  >
                    Min. sipariş
                  </label>
                  <input
                    id={`v-min-siparis-${v.key}`}
                    className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm"
                    value={v.minSiparisStr}
                    onChange={(e) => {
                      setVariants((rows) => {
                        const next = [...rows];
                        next[i] = { ...next[i]!, minSiparisStr: e.target.value };
                        return next;
                      });
                    }}
                    type="text"
                    inputMode="numeric"
                    placeholder="Opsiyonel"
                    autoComplete="off"
                  />
                </div>
              </div>
              {stokSifirGoster && (
                <p
                  className="text-xs font-medium text-amber-700"
                  role="status"
                >
                  Stokta Yok
                </p>
              )}
              <div className="max-w-md">
                <label
                  className="text-xs text-slate-500"
                  htmlFor={`v-stok-durum-${v.key}`}
                >
                  Stok durumu
                </label>
                <select
                  id={`v-stok-durum-${v.key}`}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm"
                  value={v.stok_durumu}
                  onChange={(e) => {
                    setVariants((rows) => {
                      const next = [...rows];
                      next[i] = {
                        ...next[i]!,
                        stok_durumu: stokDegeriToKod(e.target.value),
                      };
                      return next;
                    });
                  }}
                >
                  {STOK_DURUMU_SECENEKLERI.map((s) => (
                    <option key={s.kod} value={s.kod}>
                      {s.metin}
                    </option>
                  ))}
                </select>
              </div>
              <VariantFotoYukle
                gorselUrls={v.gorselUrls}
                onAddUrl={(url) => {
                  const den = fotoCevreKayitIcin(variants, 1);
                  if (!den.ok) {
                    toast("error", limitFotografMesaj(den.sonToplam, den.maks));
                    return;
                  }
                  setVariants((rows) => {
                    const next = [...rows];
                    const r = next[i]!;
                    next[i] = {
                      ...r,
                      gorselUrls: [...r.gorselUrls, url],
                    };
                    return next;
                  });
                }}
                onRemoveUrl={(j) => {
                  setVariants((rows) => {
                    const next = [...rows];
                    const r = next[i]!;
                    next[i] = {
                      ...r,
                      gorselUrls: r.gorselUrls.filter((_, x) => x !== j),
                    };
                    return next;
                  });
                }}
              />
              <button
                type="button"
                onClick={() => setVariants((rows) => rows.filter((_, j) => j !== i))}
                className="text-xs text-red-600 hover:underline"
              >
                Varyant satırını kaldır
              </button>
            </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Kaydet
        </button>
        <Link
          href="/dashboard/urunler"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Vazgeç
        </Link>
      </div>
    </form>
  );
}
