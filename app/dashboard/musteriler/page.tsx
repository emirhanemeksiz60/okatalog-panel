"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { aktiviteKaydet } from "@/lib/aktivite-logu";
import {
  type FirmaLimitBilgisi,
  limitIletisimMesaj,
  yukleFirmaLimitBilgisi,
} from "@/lib/firma-limit-usage";
import type { Musteri } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LimitBilgiCubugu } from "@/components/LimitBilgiCubugu";
import { LoadingScreen } from "@/components/LoadingScreen";

type ParaBirimi = "TRY" | "USD" | "EUR" | "GBP";
type TabKey = "musteriler" | "fiyat";
const PAGE_SIZE = 50;

type FiyatListesi = {
  id: string;
  firma_id: string;
  liste_adi: string;
  aciklama: string | null;
  para_birimi: ParaBirimi;
  ozel_musteri_id: string | null;
  aktif: boolean;
};

type FiyatKalem = {
  id: string;
  liste_id: string;
  firma_id: string;
  urun_kodu: string;
  fiyat: number;
};

type UrunLite = {
  urun_kodu: string;
  urun_adi: string;
  fiyat: number | null;
  aktif: boolean;
};

const PARA_BIRIMLERI: ParaBirimi[] = ["TRY", "USD", "EUR", "GBP"];

function parsePrice(v: unknown): number | null {
  const t = String(v ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function MusterilerPage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Musteri[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [kod, setKod] = useState("");
  const [ad, setAd] = useState("");
  const [sifre, setSifre] = useState("");
  const [yeniMusteriFiyatListesiId, setYeniMusteriFiyatListesiId] = useState("");
  const [limitB, setLimitB] = useState<FirmaLimitBilgisi | null>(null);
  const [tab, setTab] = useState<TabKey>("musteriler");
  const [fiyatLoading, setFiyatLoading] = useState(false);
  const [fiyatListeleri, setFiyatListeleri] = useState<FiyatListesi[]>([]);
  const [fiyatKalemleri, setFiyatKalemleri] = useState<FiyatKalem[]>([]);
  const [kalemSayilari, setKalemSayilari] = useState<Record<string, number>>({});
  const [urunler, setUrunler] = useState<UrunLite[]>([]);
  const [seciliListeId, setSeciliListeId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [duzenlenenListe, setDuzenlenenListe] = useState<FiyatListesi | null>(null);
  const [kaydetListeLoading, setKaydetListeLoading] = useState(false);
  const [listeAdi, setListeAdi] = useState("");
  const [listeAciklama, setListeAciklama] = useState("");
  const [listeParaBirimi, setListeParaBirimi] = useState<ParaBirimi>("TRY");
  const [listeOzelMusteriId, setListeOzelMusteriId] = useState<string>("");
  const [excelUploading, setExcelUploading] = useState(false);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const firmaId = session?.firma.id;

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [res, lim] = await Promise.all([
        fetch(`/api/dashboard/data?tip=musteriler&sayfa=${page + 1}`, {
          credentials: "include",
        }),
        yukleFirmaLimitBilgisi(firmaId),
      ]);
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        musteriler?: Musteri[];
        totalCount?: number;
      };
      if (!res.ok || !j.ok || !j.musteriler) {
        throw new Error(j.error ?? "Müşteriler yüklenemedi.");
      }
      setLimitB(lim);
      setTotalCount(j.totalCount ?? 0);
      setRows(j.musteriler);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Müşteriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [firmaId, page, toast]);

  useEffect(() => {
    if (!ready || !firmaId) return;
    queueMicrotask(() => {
      void load();
    });
  }, [ready, firmaId, load]);

  const loadFiyatData = useCallback(async () => {
    if (!firmaId) return;
    setFiyatLoading(true);
    try {
      const [lRes, uRes] = await Promise.all([
        fetch("/api/dashboard/data?tip=fiyat_listeleri", { credentials: "include" }),
        fetch("/api/dashboard/data?tip=urunler_fiyat", { credentials: "include" }),
      ]);
      const lj = (await lRes.json()) as {
        ok?: boolean;
        error?: string;
        fiyatListeleri?: FiyatListesi[];
        kalemSayilari?: Record<string, number>;
      };
      const uj = (await uRes.json()) as {
        ok?: boolean;
        error?: string;
        urunler?: UrunLite[];
      };
      if (!lRes.ok || !lj.ok || !lj.fiyatListeleri) {
        throw new Error(lj.error ?? "Fiyat listeleri yüklenemedi.");
      }
      if (!uRes.ok || !uj.ok || !uj.urunler) {
        throw new Error(uj.error ?? "Ürünler yüklenemedi.");
      }
      const listeler = lj.fiyatListeleri ?? [];
      setFiyatListeleri(listeler);
      setKalemSayilari(lj.kalemSayilari ?? {});
      setUrunler(uj.urunler);
      setSeciliListeId((prev) => {
        if (prev && listeler.some((x) => x.id === prev)) return prev;
        return listeler[0]?.id ?? null;
      });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Fiyat listeleri yüklenemedi.");
    } finally {
      setFiyatLoading(false);
    }
  }, [firmaId, toast]);

  useEffect(() => {
    if (!firmaId || !seciliListeId) {
      setFiyatKalemleri([]);
      return;
    }
    let stop = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/data?tip=fiyat_liste_kalemleri&liste_id=${encodeURIComponent(seciliListeId)}`,
          { credentials: "include" },
        );
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          rows?: {
            id: string;
            liste_id: string;
            firma_id: string;
            urun_kodu: string;
            fiyat: number;
          }[];
        };
        if (stop) return;
        if (!res.ok || !j.ok || !j.rows) {
          throw new Error(j.error ?? "Kalemler yüklenemedi.");
        }
        setFiyatKalemleri(
          j.rows.map((k) => ({
            id: k.id,
            liste_id: k.liste_id,
            firma_id: k.firma_id,
            urun_kodu: k.urun_kodu,
            fiyat: k.fiyat,
          })),
        );
      } catch (e) {
        if (!stop) {
          toast("error", e instanceof Error ? e.message : "Kalemler yüklenemedi.");
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [firmaId, seciliListeId, toast]);

  useEffect(() => {
    if (!ready || !firmaId) return;
    queueMicrotask(() => {
      void loadFiyatData();
    });
  }, [ready, firmaId, loadFiyatData]);

  const musteriById = useMemo(() => {
    const m: Record<string, Musteri> = {};
    rows.forEach((r) => {
      m[r.id] = r;
    });
    return m;
  }, [rows]);

  const seciliListe = useMemo(
    () => fiyatListeleri.find((x) => x.id === seciliListeId) ?? null,
    [fiyatListeleri, seciliListeId],
  );

  const fiyatListeById = useMemo(() => {
    const m: Record<string, FiyatListesi> = {};
    fiyatListeleri.forEach((f) => {
      m[f.id] = f;
    });
    return m;
  }, [fiyatListeleri]);

  const seciliKalemler = useMemo(() => {
    return [...fiyatKalemleri].sort((a, b) =>
      a.urun_kodu.localeCompare(b.urun_kodu, "tr"),
    );
  }, [fiyatKalemleri]);

  const urunAdByKod = useMemo(() => {
    const m: Record<string, string> = {};
    urunler.forEach((u) => {
      m[u.urun_kodu] = u.urun_adi;
    });
    return m;
  }, [urunler]);

  function openCreateModal() {
    setDuzenlenenListe(null);
    setListeAdi("");
    setListeAciklama("");
    setListeParaBirimi("TRY");
    setListeOzelMusteriId("");
    setModalOpen(true);
  }

  function openEditModal() {
    if (!seciliListe) return;
    setDuzenlenenListe(seciliListe);
    setListeAdi(seciliListe.liste_adi);
    setListeAciklama(seciliListe.aciklama ?? "");
    setListeParaBirimi(seciliListe.para_birimi);
    setListeOzelMusteriId(seciliListe.ozel_musteri_id ?? "");
    setModalOpen(true);
  }

  async function kaydetListe(e: React.FormEvent) {
    e.preventDefault();
    if (!firmaId) return;
    if (!listeAdi.trim()) {
      toast("error", "Liste adı zorunlu.");
      return;
    }
    setKaydetListeLoading(true);
    try {
      if (duzenlenenListe) {
        const res = await fetch("/api/dashboard/mutate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tip: "fiyat_listeleri",
            payload: {
              action: "update",
              id: duzenlenenListe.id,
              liste_adi: listeAdi.trim(),
              aciklama: listeAciklama.trim() || null,
              para_birimi: listeParaBirimi,
              ozel_musteri_id: listeOzelMusteriId || null,
            },
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) throw new Error(j.error ?? "Kayıt başarısız.");
        toast("success", "Fiyat listesi güncellendi.");
      } else {
        const res = await fetch("/api/dashboard/mutate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tip: "fiyat_listeleri",
            payload: {
              action: "insert",
              liste_adi: listeAdi.trim(),
              aciklama: listeAciklama.trim() || null,
              para_birimi: listeParaBirimi,
              ozel_musteri_id: listeOzelMusteriId || null,
            },
          }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string; id?: string };
        if (!res.ok || !j.ok) throw new Error(j.error ?? "Kayıt başarısız.");
        setSeciliListeId(j.id ?? null);
        toast("success", "Fiyat listesi oluşturuldu.");
      }
      setModalOpen(false);
      await loadFiyatData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Liste kaydedilemedi.";
      if (msg.toLowerCase().includes("max") || msg.toLowerCase().includes("10")) {
        toast("error", "Firma başına en fazla 10 aktif fiyat listesi oluşturabilirsiniz.");
      } else {
        toast("error", msg);
      }
    } finally {
      setKaydetListeLoading(false);
    }
  }

  async function listePasifYap(liste: FiyatListesi) {
    if (!firmaId) return;
    if (!window.confirm(`"${liste.liste_adi}" listesi pasife alınsın mı?`)) return;
    try {
      const res = await fetch("/api/dashboard/mutate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "fiyat_listeleri",
          payload: { action: "pasifle", id: liste.id },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Liste pasife alınamadı.");
      toast("success", "Liste pasife alındı.");
      await loadFiyatData();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Liste pasife alınamadı.");
    }
  }

  async function excelIndir() {
    if (!firmaId || !seciliListe) return;
    try {
      const uRes = await fetch("/api/dashboard/data?tip=urunler_fiyat", {
        credentials: "include",
      });
      const uj = (await uRes.json()) as {
        ok?: boolean;
        urunler?: UrunLite[];
      };
      if (!uRes.ok || !uj.ok || !uj.urunler) {
        throw new Error("Ürün listesi alınamadı.");
      }
      const activeUrunler = (uj.urunler ?? [])
        .filter((u) => u.aktif)
        .map((u) => ({
          urun_kodu: u.urun_kodu,
          urun_adi: u.urun_adi,
          fiyat: Number(u.fiyat ?? 0),
        }));

      const mevcutFiyatByKod: Record<string, number> = {};
      seciliKalemler.forEach((k) => {
        mevcutFiyatByKod[k.urun_kodu] = k.fiyat;
      });

      const satirlar = activeUrunler.map((u) => ({
        "Ürün Kodu": u.urun_kodu,
        "Ürün Adı": u.urun_adi,
        [`Fiyat (${seciliListe.para_birimi})`]:
          mevcutFiyatByKod[u.urun_kodu] ?? Number(u.fiyat ?? 0),
      }));
      const ws = XLSX.utils.json_to_sheet(satirlar);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Fiyat Listesi");
      XLSX.writeFile(wb, `${seciliListe.liste_adi.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Excel indirilemedi.");
    }
  }

  async function excelYukleDosya(file: File) {
    if (!firmaId || !seciliListe) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx")) {
      toast("error", "Yalnızca .xlsx dosyası yükleyebilirsiniz.");
      return;
    }
    setExcelUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("Excel sayfası bulunamadı.");
      const ws = wb.Sheets[sheetName];
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: "",
        blankrows: false,
      });
      if (aoa.length < 2) throw new Error("Excel boş veya geçersiz.");
      const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
      const urunKodIdx = headers.findIndex((h) => h === "ürün kodu" || h === "urun kodu");
      const fiyatIdx = headers.findIndex((h) => h.startsWith("fiyat"));
      if (urunKodIdx < 0 || fiyatIdx < 0) {
        throw new Error('Excel içinde "Ürün Kodu" ve "Fiyat" sütunları olmalı.');
      }

      const aktifKodSet = new Set(
        urunler.filter((u) => u.aktif).map((u) => u.urun_kodu.toLowerCase()),
      );
      const kalemler: {
        liste_id: string;
        firma_id: string;
        urun_kodu: string;
        fiyat: number;
      }[] = [];

      for (let i = 1; i < aoa.length; i += 1) {
        const row = aoa[i] ?? [];
        const kod = String(row[urunKodIdx] ?? "").trim();
        const fiyat = parsePrice(row[fiyatIdx]);
        if (!kod || fiyat == null) continue;
        if (!aktifKodSet.has(kod.toLowerCase())) continue;
        kalemler.push({
          liste_id: seciliListe.id,
          firma_id: firmaId,
          urun_kodu: kod,
          fiyat,
        });
      }

      const res = await fetch("/api/dashboard/mutate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "fiyat_liste_kalemleri",
          payload: {
            action: "toplu_guncelle",
            liste_id: seciliListe.id,
            rows: kalemler.map((k) => ({
              urun_kodu: k.urun_kodu,
              fiyat: k.fiyat,
            })),
          },
        }),
      });
      const mj = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !mj.ok) throw new Error(mj.error ?? "Excel kaydı başarısız.");
      toast("success", `Excel yüklendi. ${kalemler.length} kalem işlendi.`);
      await loadFiyatData();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Excel yükleme başarısız.");
    } finally {
      setExcelUploading(false);
    }
  }

  async function ekleMusteri(e: React.FormEvent) {
    e.preventDefault();
    const k = kod.trim();
    const a = ad.trim();
    const s = sifre;
    if (!k || !a) {
      toast("error", "Kod ve ad gerekli.");
      return;
    }
    if (!s || s.length < 4) {
      toast("error", "Şifre en az 4 karakter olmalı.");
      return;
    }
    if (!firmaId) return;
    try {
      const can = await yukleFirmaLimitBilgisi(firmaId);
      if (can.kullanim.musteri >= can.limits.max_musteri) {
        toast(
          "error",
          limitIletisimMesaj(
            "musteri",
            can.kullanim.musteri,
            can.limits.max_musteri,
          ),
        );
        return;
      }
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Limit okunamadı.");
      return;
    }
    try {
      const resIns = await fetch("/api/dashboard/mutate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "musteriler",
          payload: {
            action: "insert",
            musteri_kodu: k,
            musteri_adi: a,
            fiyat_listesi_id: yeniMusteriFiyatListesiId || null,
            sifre_plain: s,
          },
        }),
      });
      const insJ = (await resIns.json()) as {
        ok?: boolean;
        error?: string;
        data?: Musteri;
      };
      if (!resIns.ok || !insJ.ok || !insJ.data) {
        throw new Error(insJ.error ?? "Eklenemedi.");
      }
      const data = insJ.data;
      setRows((r) =>
        [...r, data as Musteri].sort((x, y) =>
          x.musteri_kodu.localeCompare(y.musteri_kodu),
        ),
      );
      setKod("");
      setAd("");
      setSifre("");
      setYeniMusteriFiyatListesiId("");
      await aktiviteKaydet({
        firmaId,
        islem: "musteri_eklendi",
        hedefTablo: "musteriler",
        hedefId: (data as Musteri).id,
        detay: { musteri_adi: a, musteri_kodu: k },
      });
      toast("success", "Müşteri eklendi.");
      void load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Eklenemedi.");
    }
  }

  async function sil(m: Musteri) {
    if (!firmaId) return;
    if (!window.confirm(`“${m.musteri_adi}” silinsin mi?`)) return;
    try {
      const res = await fetch("/api/dashboard/mutate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "musteriler",
          payload: { action: "softdelete", id: m.id },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Silinemedi.");
      await aktiviteKaydet({
        firmaId,
        islem: "musteri_silindi",
        hedefTablo: "musteriler",
        hedefId: m.id,
        detay: { musteri_adi: m.musteri_adi },
      });
      setRows((r) => r.filter((x) => x.id !== m.id));
      toast("success", "Silindi.");
      void load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Silinemedi.");
    }
  }

  if (!ready || !session) {
    return <LoadingScreen />;
  }
  if (loading) {
    return <LoadingScreen label="Müşteriler yükleniyor…" />;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Müşteriler</h1>
      <p className="mt-1 text-sm text-slate-600">
        Müşteri yönetimi ve fiyat listeleri
      </p>
      <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab("musteriler")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            tab === "musteriler"
              ? "bg-sky-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Müşteriler
        </button>
        <button
          type="button"
          onClick={() => setTab("fiyat")}
          className={`rounded-md px-3 py-1.5 text-sm ${
            tab === "fiyat" ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          Fiyat Listeleri
        </button>
      </div>

      {tab === "musteriler" && (
        <>
          <p className="mt-3 text-sm text-slate-600">
            Kataloğu görüntüleyen bayiler / müşteriler. Şifreler Supabase (bcrypt)
            üzerinde hash’lenir; bu sayfada şifre metni listelenmez.
          </p>
          {limitB && (
            <div className="mt-3 max-w-3xl">
              <LimitBilgiCubugu bilgi={limitB} sadece={["musteri"]} />
            </div>
          )}

          <form
            onSubmit={ekleMusteri}
            className="mt-6 max-w-5xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid sm:grid-cols-2 sm:items-end sm:gap-3 sm:space-y-0 lg:grid-cols-5"
          >
            <div>
              <label className="text-sm font-medium text-slate-700">Müşteri kodu</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={kod}
                onChange={(e) => setKod(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Müşteri adı</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={ad}
                onChange={(e) => setAd(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Şifre</label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Fiyat Listesi</label>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={yeniMusteriFiyatListesiId}
                onChange={(e) => setYeniMusteriFiyatListesiId(e.target.value)}
              >
                <option value="">— Varsayılan Fiyat —</option>
                {fiyatListeleri.map((f) => (
                  <option key={f.id} value={f.id}>
                    {`${f.ozel_musteri_id ? "👤 " : ""}${f.liste_adi} (${f.para_birimi})`}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="h-9 w-full rounded-lg bg-sky-600 text-sm font-medium text-white hover:bg-sky-700"
            >
              Ekle
            </button>
          </form>

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Kod</th>
                  <th className="px-4 py-3 font-medium">Ad</th>
                  <th className="px-4 py-3 font-medium">Fiyat Listesi</th>
                  <th className="min-w-[10rem] px-4 py-3 font-medium">Şifre değiştir</th>
                  <th className="w-20 px-4 py-3 font-medium">Aktif</th>
                  <th className="w-32 px-4 py-3 text-right font-medium">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Henüz müşteri yok. Yukarıdan yeni kayıt ekleyin.
                    </td>
                  </tr>
                )}
                {rows.map((m) => (
                  <MusteriRow
                    key={`${m.id}-${m.musteri_kodu}-${m.musteri_adi}-${m.aktif ? "1" : "0"}`}
                    m={m}
                    onGuncellendi={load}
                    onSil={() => void sil(m)}
                    toast={toast}
                    fiyatListeleri={fiyatListeleri}
                    fiyatListeById={fiyatListeById}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Sayfa {page + 1} / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
              >
                Önceki
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= totalCount}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
              >
                Sonraki
              </button>
            </div>
          </div>
        </>
      )}

      {tab === "fiyat" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-700">
                Fiyat Listeleri ({fiyatListeleri.length}/10)
              </div>
              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                + Yeni Liste
              </button>
            </div>
            {fiyatLoading ? (
              <p className="py-4 text-sm text-slate-500">Yükleniyor...</p>
            ) : fiyatListeleri.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">Henüz fiyat listesi yok.</p>
            ) : (
              <div className="space-y-2">
                {fiyatListeleri.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSeciliListeId(l.id)}
                    className={`w-full rounded-lg border p-3 text-left ${
                      seciliListeId === l.id
                        ? "border-sky-400 bg-sky-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{l.liste_adi}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {l.para_birimi} · {kalemSayilari[l.id] ?? 0} ürün
                        </p>
                        {l.ozel_musteri_id && (
                          <p className="mt-0.5 text-xs text-amber-700">
                            Kişiye özel:{" "}
                            {musteriById[l.ozel_musteri_id]?.musteri_adi ?? "Bilinmeyen müşteri"}
                          </p>
                        )}
                      </div>
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          void listePasifYap(l);
                        }}
                        className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Sil
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {!seciliListe ? (
              <p className="py-12 text-center text-sm text-slate-500">
                Sol taraftan bir fiyat listesi seçin.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{seciliListe.liste_adi}</h2>
                    <p className="text-sm text-slate-500">
                      {seciliKalemler.length} ürün
                      {seciliListe.aciklama ? ` · ${seciliListe.aciklama}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={openEditModal}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => void excelIndir()}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-50"
                    >
                      Excel İndir
                    </button>
                    <button
                      type="button"
                      disabled={excelUploading}
                      onClick={() => excelInputRef.current?.click()}
                      className="rounded-lg border border-sky-300 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                    >
                      {excelUploading ? "Yükleniyor..." : "Excel Yükle"}
                    </button>
                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f) void excelYukleDosya(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
                <div className="mt-4 max-h-[60vh] overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">Ürün Kodu</th>
                        <th className="px-3 py-2 font-medium">Ürün Adı</th>
                        <th className="px-3 py-2 font-medium text-right">
                          Fiyat ({seciliListe.para_birimi})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {seciliKalemler.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center text-slate-500">
                            Bu listede henüz kalem yok.
                          </td>
                        </tr>
                      )}
                      {seciliKalemler.map((k) => (
                        <tr key={k.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono">{k.urun_kodu}</td>
                          <td className="px-3 py-2">{urunAdByKod[k.urun_kodu] ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {k.fiyat}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            onSubmit={kaydetListe}
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-slate-900">
              {duzenlenenListe ? "Liste Düzenle" : "Yeni Liste"}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Liste Adı</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={listeAdi}
                  onChange={(e) => setListeAdi(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Açıklama</label>
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={listeAciklama}
                  onChange={(e) => setListeAciklama(e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Para Birimi</label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={listeParaBirimi}
                    onChange={(e) => setListeParaBirimi(e.target.value as ParaBirimi)}
                  >
                    {PARA_BIRIMLERI.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Kişiye Özel Müşteri
                  </label>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={listeOzelMusteriId}
                    onChange={(e) => setListeOzelMusteriId(e.target.value)}
                  >
                    <option value="">Genel liste</option>
                    {rows.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.musteri_adi}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={kaydetListeLoading}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {kaydetListeLoading ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function MusteriRow({
  m,
  onGuncellendi,
  onSil,
  toast,
  fiyatListeleri,
  fiyatListeById,
}: {
  m: Musteri;
  onGuncellendi: () => void;
  onSil: () => void;
  toast: (type: "success" | "error", message: string) => void;
  fiyatListeleri: FiyatListesi[];
  fiyatListeById: Record<string, FiyatListesi>;
}) {
  const [kod, setKod] = useState(m.musteri_kodu);
  const [ad, setAd] = useState(m.musteri_adi);
  const [fiyatListesiId, setFiyatListesiId] = useState(m.fiyat_listesi_id ?? "");
  const [sifre, setSifre] = useState("");
  const [saving, setSaving] = useState(false);

  async function kaydet() {
    if (!kod.trim() || !ad.trim()) {
      toast("error", "Kod ve ad gerekli.");
      return;
    }
    if (sifre && sifre.length < 4) {
      toast("error", "Şifre en az 4 karakter veya boş bırakın (değişmesin).");
      return;
    }
    setSaving(true);
    try {
      const bodyPayload: Record<string, unknown> = {
        action: "update",
        id: m.id,
        musteri_kodu: kod.trim(),
        musteri_adi: ad.trim(),
        fiyat_listesi_id: fiyatListesiId || null,
        aktif: m.aktif,
      };
      if (sifre.trim().length) {
        bodyPayload.sifre_plain = sifre.trim();
      }
      const res = await fetch("/api/dashboard/mutate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "musteriler",
          payload: bodyPayload,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Güncellenemedi.");
      setSifre("");
      onGuncellendi();
      toast("success", "Güncellendi.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Güncellenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-2">
        <input
          className="w-full min-w-0 max-w-xs rounded border border-slate-200 px-2 py-1.5 text-sm"
          value={kod}
          onChange={(e) => setKod(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <input
          className="w-full min-w-0 max-w-sm rounded border border-slate-200 px-2 py-1.5 text-sm"
          value={ad}
          onChange={(e) => setAd(e.target.value)}
        />
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-col gap-1">
          <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {fiyatListesiId && fiyatListeById[fiyatListesiId]
              ? `${fiyatListeById[fiyatListesiId]!.liste_adi}`
              : "Varsayılan"}
          </span>
          <select
            className="w-full min-w-0 max-w-xs rounded border border-slate-200 px-2 py-1.5 text-xs"
            value={fiyatListesiId}
            onChange={(e) => setFiyatListesiId(e.target.value)}
          >
            <option value="">— Varsayılan Fiyat —</option>
            {fiyatListeleri.map((f) => (
              <option key={f.id} value={f.id}>
                {`${f.ozel_musteri_id ? "👤 " : ""}${f.liste_adi} (${f.para_birimi})`}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className="px-4 py-2">
        <input
          type="password"
          className="w-full min-w-0 max-w-xs rounded border border-slate-200 px-2 py-1.5 text-xs"
          placeholder="Boş: değişmesin"
          value={sifre}
          onChange={(e) => setSifre(e.target.value)}
          autoComplete="new-password"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <input
          type="checkbox"
          checked={m.aktif}
          onChange={async (e) => {
            const checked = e.target.checked;
            try {
              const res = await fetch("/api/dashboard/mutate", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tip: "musteriler",
                  payload: {
                    action: "update",
                    id: m.id,
                    musteri_kodu: kod.trim(),
                    musteri_adi: ad.trim(),
                    fiyat_listesi_id: fiyatListesiId || null,
                    aktif: checked,
                  },
                }),
              });
              const j = (await res.json()) as { ok?: boolean; error?: string };
              if (!res.ok || !j.ok) {
                toast("error", j.error ?? "Güncellenemedi.");
                return;
              }
              onGuncellendi();
              toast("success", "Durum güncellendi.");
            } catch (err) {
              toast("error", err instanceof Error ? err.message : "Güncellenemedi.");
            }
          }}
        />
      </td>
      <td className="space-x-2 px-4 py-2 text-right text-sm">
        <button
          type="button"
          onClick={kaydet}
          disabled={saving}
          className="text-sky-600 hover:underline disabled:opacity-50"
        >
          {saving ? "…" : "Kaydet"}
        </button>
        <span className="text-slate-300" aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={onSil}
          className="text-red-600 hover:underline"
        >
          Sil
        </button>
      </td>
    </tr>
  );
}
