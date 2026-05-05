"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { tekilRotaParam } from "@/lib/tekil-rota-param";
import type { FirmaKullanimOzet } from "@/lib/admin-aggregates";
import {
  PAKET_DROPDOWN,
  aktifPaketKoduCoz,
  paketOtomatikLimitler,
  type PaketKodu,
} from "@/lib/admin-paketler";
import type { Firma } from "@/lib/types";
import { useAdminAuth } from "@/context/admin-auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";
import { UsageBar } from "@/components/admin/UsageBar";

function bitisGunu(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(String(iso));
  if (Number.isNaN(t.getTime())) return String(iso).slice(0, 10);
  return t.toISOString().slice(0, 10);
}

export default function AdminFirmaDuzenle() {
  const p = useParams();
  const id = tekilRotaParam(p.id);
  const { session, ready } = useAdminAuth();
  const { show: toast } = useToast();
  const [yuk, setYuk] = useState(true);
  const [fir, setFir] = useState<Firma | null>(null);
  const [kull, setKull] = useState<FirmaKullanimOzet | null>(null);
  const [kay, setKay] = useState(false);
  const [sifirlaniyor, setSifirlaniyor] = useState(false);
  const [f, setF] = useState<Partial<Firma>>({});
  /** Tarih seçici (YYYY-MM-DD); `paket_bitis_tarihi` ile eşleşir */
  const [paketBitisYmd, setPaketBitisYmd] = useState("");

  const [kullanimUyarisi, setKullanimUyarisi] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    if (!id) return;
    setYuk(true);
    setKullanimUyarisi(null);
    setKull(null);

    const debugLog =
      process.env.NODE_ENV === "development" ||
      process.env.NEXT_PUBLIC_DEBUG_ADMIN_FIRMA === "1";
    if (debugLog) {
      const uuidBicim =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        );
      console.log("[admin/firmalar/[id]] sorgu param", {
        id,
        idLen: id.length,
        uuidBicim,
        filtre: ".eq('id', id)",
      });
    }

    try {
      if (debugLog) {
        console.log("[admin/firmalar/[id]] GET /api/admin/firmalar/:id", { id });
      }
      const res = await fetch(
        `/api/admin/firmalar/${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        firma?: Firma;
        kullanim?: FirmaKullanimOzet | null;
        kullanimUyari?: string | null;
      };
      if (debugLog) {
        console.log("[admin/firmalar/[id]] API yanıt", { status: res.status, j });
      }
      if (res.status === 404) {
        if (debugLog) {
          console.warn("[admin/firmalar/[id]] 404", { arananId: id });
        }
        setFir(null);
        return;
      }
      if (!res.ok || !j.ok || !j.firma) {
        throw new Error(j.error ?? "Firma yüklenemedi");
      }
      const c = j.firma;
      setFir(c);
      setF(c);
      setPaketBitisYmd(bitisGunu(c.paket_bitis_tarihi));
      setKull(j.kullanim ?? null);
      setKullanimUyarisi(j.kullanimUyari ?? null);
    } catch (e) {
      console.error("[admin/firmalar/[id]] firma yükleme hata", e);
      toast("error", e instanceof Error ? e.message : "Firma yüklenemedi");
      setFir(null);
    } finally {
      setYuk(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (!ready || !session) return;
    if (!id) {
      setYuk(false);
      return;
    }
    queueMicrotask(() => {
      void yukle();
    });
  }, [ready, session, id, yukle]);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !fir) return;
    setKay(true);
    try {
      const pak: PaketKodu = aktifPaketKoduCoz(
        f.aktif_paket ?? fir.aktif_paket,
      );
      const body = {
        firma_kodu: (f.firma_kodu ?? fir.firma_kodu).trim().toLowerCase(),
        firma_adi: (f.firma_adi ?? fir.firma_adi).trim(),
        slogan:
          f.slogan == null || !String(f.slogan).trim() ? null : String(f.slogan),
        logo_url:
          f.logo_url == null || !String(f.logo_url).trim()
            ? null
            : String(f.logo_url).trim(),
        max_kategori: Math.max(0, Number(f.max_kategori) || 0),
        max_musteri: Math.max(0, Number(f.max_musteri) || 0),
        max_urun: Math.max(0, Number(f.max_urun) || 0),
        max_varyant: Math.max(0, Number(f.max_varyant) || 0),
        max_fotograf: Math.max(0, Number(f.max_fotograf) || 0),
        max_ai_gunluk: Math.max(0, Number(f.max_ai_gunluk) || 5),
        aktif_paket: pak,
        paket_bitis_ymd: paketBitisYmd,
        notlar: f.notlar == null ? null : String(f.notlar) || null,
        aktif: Boolean(f.aktif),
      };
      const res = await fetch(`/api/admin/firmalar/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        throw new Error(j.error ?? "Kayıt hatası");
      }
      toast("success", "Kaydedildi.");
      await yukle();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setKay(false);
    }
  }

  async function aiSayacSifirla() {
    if (!id || !fir) return;
    setSifirlaniyor(true);
    try {
      const res = await fetch(
        `/api/admin/firmalar/${encodeURIComponent(id)}/ai-sifirla`,
        { method: "POST", credentials: "include" },
      );
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        throw new Error(j.error ?? "Sıfırlanamadı");
      }
      setF((x) => ({ ...x, ai_kullanim_bugun: 0 }));
      toast("success", "AI sayacı sıfırlandı (bugün).");
      await yukle();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Sıfırlanamadı");
    } finally {
      setSifirlaniyor(false);
    }
  }

  if (!ready) return <LoadingScreen label="Oturum…" />;
  if (!session) return <LoadingScreen label="Girişe yönlendiriliyor…" />;
  if (yuk) return <LoadingScreen label="Firma yükleniyor…" />;
  if (!id || !fir) {
    return (
      <div>
        <p className="text-slate-400">Firma bulunamadı.</p>
        <Link
          className="mt-2 inline-block text-amber-400 hover:underline"
          href="/admin/firmalar"
        >
          Firmalara dön
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-sm text-slate-500">
        <Link
          href="/admin/firmalar"
          className="text-amber-400/90 hover:underline"
        >
          ← Firmalar
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white">Firma düzenle</h1>
      <p className="mt-1 text-sm text-slate-500">{f.firma_adi ?? fir.firma_adi}</p>

      <form
        onSubmit={kaydet}
        className="mt-6 max-w-2xl space-y-5"
      >
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-medium text-amber-200/90">Bilgiler</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-300 sm:col-span-1">
              Firma kodu
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                value={f.firma_kodu ?? ""}
                onChange={(e) => setF((x) => ({ ...x, firma_kodu: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm text-slate-300 sm:col-span-1">
              Firma adı
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.firma_adi ?? ""}
                onChange={(e) => setF((x) => ({ ...x, firma_adi: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm text-slate-300 sm:col-span-2">
              Slogan
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.slogan ?? ""}
                onChange={(e) => setF((x) => ({ ...x, slogan: e.target.value }))}
              />
            </label>
            <label className="block text-sm text-slate-300 sm:col-span-2">
              Logo URL
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
                value={f.logo_url ?? ""}
                onChange={(e) => setF((x) => ({ ...x, logo_url: e.target.value }))}
                placeholder="https://"
              />
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Esnaf girişi: <code className="text-amber-200/90">firmalar.panel_sifre</code>{" "}
              (bcrypt) —{" "}
              <code className="text-amber-200/90">verify_firma_password</code> RPC. Hash
              atamak için Supabase&apos;de{" "}
              <code className="text-amber-200/90">musteri_sifre_hash(plain)</code> sonucu
              bu sütuna yazılabilir.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="text-sm font-medium text-amber-200/90">Kullanım</h2>
            {kullanimUyarisi && !kull && (
              <p className="mt-2 text-sm text-amber-200/80">{kullanimUyarisi}</p>
            )}
            {kull && (
              <div className="mt-3">
                <UsageBar
                  etiket="Kategori"
                  guncel={kull.kategori}
                  limit={f.max_kategori ?? fir.max_kategori}
                />
                <UsageBar
                  etiket="Müşteri"
                  guncel={kull.musteri}
                  limit={f.max_musteri ?? fir.max_musteri}
                />
                <UsageBar
                  etiket="Ürün"
                  guncel={kull.urun}
                  limit={f.max_urun ?? fir.max_urun}
                />
                <UsageBar
                  etiket="Varyant"
                  guncel={kull.varyant}
                  limit={f.max_varyant ?? fir.max_varyant}
                />
                <UsageBar
                  etiket="Fotoğraf (görsel alanı)"
                  guncel={kull.fotograf}
                  limit={f.max_fotograf ?? fir.max_fotograf}
                />
                <p className="text-xs text-slate-500">
                  Fotoğraf sayısı, varyant satırlarındaki doldurulmuş görsel URL
                  alanlarından türetilir.
                </p>
              </div>
            )}
            <div className={kull ? "mt-4 border-t border-slate-800 pt-4" : "mt-3"}>
              <p className="text-sm text-slate-200">
                AI Kullanım:{" "}
                <span className="font-mono tabular-nums text-amber-200/90">
                  {f.ai_kullanim_bugun ?? fir.ai_kullanim_bugun}/
                  {Math.max(0, f.max_ai_gunluk ?? fir.max_ai_gunluk)}
                </span>{" "}
                (bugün)
              </p>
              <div className="mt-2">
                <UsageBar
                  etiket="AI (bugün)"
                  guncel={f.ai_kullanim_bugun ?? fir.ai_kullanim_bugun}
                  limit={Math.max(1, f.max_ai_gunluk ?? fir.max_ai_gunluk)}
                />
              </div>
              <button
                type="button"
                disabled={sifirlaniyor}
                onClick={() => void aiSayacSifirla()}
                className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200/90 hover:bg-amber-500/20 disabled:opacity-50"
              >
                {sifirlaniyor ? "Sıfırlanıyor…" : "AI Sayacını Sıfırla"}
              </button>
            </div>
          </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-medium text-amber-200/90">Paket</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm text-slate-300">
              Aktif paket
              <select
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={aktifPaketKoduCoz(f.aktif_paket ?? fir.aktif_paket)}
                onChange={(e) => {
                  const v = e.target.value as PaketKodu;
                  const lim = paketOtomatikLimitler(v);
                  setF((x) => ({
                    ...x,
                    aktif_paket: v,
                    ...(lim
                      ? {
                          max_kategori: lim.max_kategori,
                          max_urun: lim.max_urun,
                          max_fotograf: lim.max_fotograf,
                          max_ai_gunluk: lim.max_ai_gunluk,
                        }
                      : {}),
                  }));
                }}
              >
                {PAKET_DROPDOWN.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.etiket}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              Paket bitiş
              <input
                type="date"
                className="mt-1 w-full min-w-[12rem] rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={paketBitisYmd}
                onChange={(e) => setPaketBitisYmd(e.target.value)}
              />
            </label>
            <p className="text-xs text-slate-500 sm:pb-2 sm:pl-1">
              Bitişi kaldırmak için tarih alanını temizleyin ve kaydedin
            </p>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Paket değişince (Enterprise dışında) kategori, ürün, fotoğraf ve günlük
            AI limitleri aşağıda otomatik doldurulur. Müşteri limiti
            paketle değişmez; yalnızca aşağıda manuel girilir.
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-medium text-amber-200/90">Limitler</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sistem genelinde kategori üst sınırı 50; müşteri limiti yalnızca
            burada belirlenir.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Maks. kategori
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.max_kategori ?? fir.max_kategori}
                onChange={(e) => {
                  const t = e.target.value;
                  setF((x) => ({
                    ...x,
                    max_kategori: t === "" ? fir.max_kategori : parseInt(t, 10) || 0,
                  }));
                }}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Maks. müşteri
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.max_musteri ?? fir.max_musteri}
                onChange={(e) => {
                  const t = e.target.value;
                  setF((x) => ({
                    ...x,
                    max_musteri: t === "" ? fir.max_musteri : parseInt(t, 10) || 0,
                  }));
                }}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Paketle ilişkili değil; yalnızca manuel.
              </span>
            </label>
            <label className="block text-sm text-slate-300">
              Maks. ürün
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.max_urun ?? fir.max_urun}
                onChange={(e) => {
                  const t = e.target.value;
                  setF((x) => ({
                    ...x,
                    max_urun: t === "" ? fir.max_urun : parseInt(t, 10) || 0,
                  }));
                }}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Maks. varyant
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.max_varyant ?? fir.max_varyant}
                onChange={(e) => {
                  const t = e.target.value;
                  setF((x) => ({
                    ...x,
                    max_varyant: t === "" ? fir.max_varyant : parseInt(t, 10) || 0,
                  }));
                }}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Maks. fotoğraf
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.max_fotograf ?? fir.max_fotograf}
                onChange={(e) => {
                  const t = e.target.value;
                  setF((x) => ({
                    ...x,
                    max_fotograf: t === "" ? fir.max_fotograf : parseInt(t, 10) || 0,
                  }));
                }}
              />
            </label>
            <label className="block text-sm text-slate-300 sm:col-span-2">
              Günlük AI Hak
              <input
                type="number"
                min={0}
                className="mt-1 w-full max-w-xs rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
                value={f.max_ai_gunluk ?? fir.max_ai_gunluk}
                onChange={(e) => {
                  const t = e.target.value;
                  setF((x) => ({
                    ...x,
                    max_ai_gunluk:
                      t === "" ? fir.max_ai_gunluk : parseInt(t, 10) || 0,
                  }));
                }}
                placeholder="5"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Günlük limit (LLM) — varsayılan: 5
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="text-sm font-medium text-amber-200/90">Notlar (notlar sütunu)</h2>
          <textarea
            className="mt-2 w-full min-h-24 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            value={f.notlar ?? ""}
            onChange={(e) => setF((x) => ({ ...x, notlar: e.target.value }))}
            placeholder="Dahili notlar"
          />
        </section>

        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              className="rounded border-slate-500"
              checked={Boolean(f.aktif)}
              onChange={(e) => setF((x) => ({ ...x, aktif: e.target.checked }))}
            />
            Firma aktif
          </label>
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={kay}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400 disabled:opacity-50"
          >
            {kay ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
