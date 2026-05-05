"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { yukleFirmaLimitBilgisi } from "@/lib/firma-limit-usage";
import type { Kategori, Urun } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

const HEADERS = [
  "urun_kodu",
  "barkod",
  "urun_adi",
  "kategori_adi",
  "detay",
  "yeni_mi",
  "guncelleme",
  "renk_adi_1",
  "stok_durumu_1",
  "stok_miktar_1",
  "renk_adi_2",
  "stok_durumu_2",
  "stok_miktar_2",
  "renk_adi_3",
  "stok_durumu_3",
  "stok_miktar_3",
] as const;

type StokKodu = "var" | "yok" | "yakinda";

type ParsedVariant = {
  renk_adi: string;
  stok_durumu: StokKodu;
  stok_miktar: number | null;
};

type ParsedRow = {
  rowNo: number;
  urun_kodu: string;
  barkod: string | null;
  urun_adi: string;
  kategori_adi: string;
  detay: string | null;
  yeni_mi: boolean;
  guncelleme: string | null;
  varyantlar: ParsedVariant[];
  errors: string[];
  warnings: string[];
  existsInDb: boolean;
};

function toText(v: unknown): string {
  return String(v ?? "").trim();
}

function parseYeniMi(v: unknown): boolean {
  const t = toText(v).toLowerCase();
  if (!t) return true;
  if (["evet", "e", "true", "1", "y", "yes"].includes(t)) return true;
  if (["hayir", "hayır", "h", "false", "0", "n", "no"].includes(t)) return false;
  return true;
}

function parseStokDurumu(v: unknown): StokKodu {
  const t = toText(v).toLowerCase();
  if (!t) return "var";
  if (t === "yok") return "yok";
  if (t === "yakinda" || t === "yakında") return "yakinda";
  return "var";
}

function parseOptionalInt(v: unknown): number | null {
  const t = toText(v);
  if (!t) return null;
  const n = parseInt(t, 10);
  if (Number.isNaN(n)) return null;
  return n;
}

function barkodGecerliMi(v: string): boolean {
  if (!v.trim()) return true;
  return /^[A-Z0-9]{1,13}$/.test(v.trim().toUpperCase());
}

function statusOf(r: ParsedRow): "error" | "warning" | "ready" {
  if (r.errors.length > 0) return "error";
  if (r.warnings.length > 0) return "warning";
  return "ready";
}

function buildTemplateWorkbook() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...HEADERS],
    [
      "Zorunlu. Ürün kodu",
      "Opsiyonel barkod (A-Z/0-9, maks 13 karakter)",
      "Zorunlu. Ürün adı",
      "Zorunlu. Mevcut kategori adı",
      "Opsiyonel ürün detayı",
      "evet/hayır (boşsa evet)",
      "Opsiyonel güncelleme notu",
      "Zorunlu ilk varyant renk adı",
      "var/yok/yakinda (boşsa var)",
      "Opsiyonel sayı",
      "Opsiyonel ikinci varyant renk adı",
      "Opsiyonel",
      "Opsiyonel sayı",
      "Opsiyonel üçüncü varyant renk adı",
      "Opsiyonel",
      "Opsiyonel sayı",
    ],
    [
      "02P",
      "8690000000001",
      "Polo Yaka Tişört",
      "Tişört",
      "Pamuklu kumaş",
      "evet",
      "STOK GÜNCELLENDİ",
      "Siyah",
      "var",
      "24",
      "Beyaz",
      "yok",
      "0",
      "",
      "",
      "",
    ],
    [
      "08K",
      "8690000000002",
      "Keten Pantolon",
      "Pantolon",
      "İnce keten",
      "hayır",
      "RENK GÜNCELLENDİ",
      "Lacivert",
      "var",
      "8",
      "Bej",
      "yakinda",
      "",
      "Gri",
      "var",
      "3",
    ],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Urunler");
  return wb;
}

export default function UrunlerExcelYuklePage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const router = useRouter();
  const firmaId = session?.firma.id;

  const [loading, setLoading] = useState(true);
  const [kategoriler, setKategoriler] = useState<Kategori[]>([]);
  const [limitMaxUrun, setLimitMaxUrun] = useState(0);
  const [kullanimUrun, setKullanimUrun] = useState(0);
  const [dbByCode, setDbByCode] = useState<Record<string, Pick<Urun, "id" | "urun_kodu">>>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);

  const kategoriByName = useMemo(() => {
    const map: Record<string, Kategori> = {};
    kategoriler.forEach((k) => {
      map[k.kategori_adi.trim().toLowerCase()] = k;
    });
    return map;
  }, [kategoriler]);

  const kategoriAdlari = useMemo(
    () => kategoriler.map((k) => k.kategori_adi).sort((a, b) => a.localeCompare(b, "tr")),
    [kategoriler],
  );

  const summary = useMemo(() => {
    let readyCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    rows.forEach((r) => {
      const s = statusOf(r);
      if (s === "ready") readyCount += 1;
      else if (s === "warning") warningCount += 1;
      else errorCount += 1;
    });
    return { readyCount, warningCount, errorCount };
  }, [rows]);

  const limitError = useMemo(() => {
    if (rows.length === 0) return null;
    const newCount = rows.filter((r) => r.errors.length === 0 && !r.existsInDb).length;
    if (kullanimUrun + newCount > limitMaxUrun) {
      return `Ürün limitiniz aşılıyor: mevcut ${kullanimUrun}/${limitMaxUrun}, yeni ${newCount} ürün eklenecek.`;
    }
    return null;
  }, [kullanimUrun, limitMaxUrun, rows]);

  const canUpload = rows.length > 0 && summary.errorCount === 0 && !limitError && !isUploading;

  const loadBaseData = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [katRes, urunRes, lim] = await Promise.all([
        fetch("/api/dashboard/data?tip=kategoriler&hepsi=1&excel=1", {
          credentials: "include",
        }),
        fetch("/api/dashboard/data?tip=urun_kodlari", {
          credentials: "include",
        }),
        yukleFirmaLimitBilgisi(firmaId),
      ]);
      const kj = (await katRes.json()) as {
        ok?: boolean;
        error?: string;
        rows?: Kategori[];
      };
      const uj = (await urunRes.json()) as {
        ok?: boolean;
        error?: string;
        urunler?: { id: string; urun_kodu: string }[];
      };
      if (!katRes.ok || !kj.ok || !kj.rows) {
        throw new Error(kj.error ?? "Kategoriler alınamadı.");
      }
      if (!urunRes.ok || !uj.ok || !uj.urunler) {
        throw new Error(uj.error ?? "Ürün kodları alınamadı.");
      }
      setKategoriler(
        kj.rows.sort((a, b) =>
          a.kategori_adi.localeCompare(b.kategori_adi, "tr"),
        ),
      );
      setLimitMaxUrun(lim.limits.max_urun);
      setKullanimUrun(lim.kullanim.urun);
      const m: Record<string, Pick<Urun, "id" | "urun_kodu">> = {};
      uj.urunler.forEach((u) => {
        m[u.urun_kodu.trim().toLowerCase()] = u;
      });
      setDbByCode(m);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Temel veriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [firmaId, toast]);

  useEffect(() => {
    if (!ready || !firmaId) return;
    queueMicrotask(() => {
      void loadBaseData();
    });
  }, [ready, firmaId, loadBaseData]);

  function parseWorkbook(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) throw new Error("Excel içinde sayfa bulunamadı.");
        const ws = wb.Sheets[firstSheet];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: "",
          blankrows: false,
        });
        if (aoa.length < 3) {
          throw new Error("Excel en az başlık + açıklama + 1 veri satırı içermeli.");
        }
        const headers = (aoa[0] ?? []).map((x) => toText(x));
        const idx: Record<string, number> = {};
        headers.forEach((h, i) => {
          if (h) idx[h] = i;
        });

        const missingHeaders = HEADERS.filter((h) => idx[h] == null);
        if (missingHeaders.length > 0) {
          throw new Error(`Eksik sütun(lar): ${missingHeaders.join(", ")}`);
        }

        const out: ParsedRow[] = [];
        for (let r = 2; r < aoa.length; r += 1) {
          const row = aoa[r] ?? [];
          const urun_kodu = toText(row[idx.urun_kodu]);
          const barkod = toText(row[idx.barkod]).toUpperCase();
          const urun_adi = toText(row[idx.urun_adi]);
          const kategori_adi = toText(row[idx.kategori_adi]);
          const detayRaw = toText(row[idx.detay]);
          const guncellemeRaw = toText(row[idx.guncelleme]);
          const errors: string[] = [];
          const warnings: string[] = [];

          const varyantlar: ParsedVariant[] = [];
          for (let i = 1; i <= 3; i += 1) {
            const renk = toText(row[idx[`renk_adi_${i}`]]);
            const stokDurum = parseStokDurumu(row[idx[`stok_durumu_${i}`]]);
            const stokMiktar = parseOptionalInt(row[idx[`stok_miktar_${i}`]]);
            if (!renk) {
              if (i === 1) errors.push("renk_adi_1 zorunlu (en az 1 varyant gerekli).");
              continue;
            }
            varyantlar.push({
              renk_adi: renk,
              stok_durumu: stokDurum,
              stok_miktar: stokMiktar,
            });
          }

          if (!urun_kodu) errors.push("urun_kodu boş olamaz.");
          if (!urun_adi) errors.push("urun_adi boş olamaz.");
          if (!barkodGecerliMi(barkod)) {
            errors.push("barkod yalnızca harf/rakam içermeli ve en fazla 13 karakter olabilir.");
          }
          if (!kategori_adi) {
            errors.push("kategori_adi boş olamaz.");
          } else if (!kategoriByName[kategori_adi.toLowerCase()]) {
            errors.push(
              `kategori_adi bulunamadı. Geçerli kategoriler: ${kategoriAdlari.join(", ")}`,
            );
          }

          const exists = !!dbByCode[urun_kodu.toLowerCase()];
          if (exists) warnings.push("Bu ürün güncellenecek.");

          out.push({
            rowNo: r + 1,
            urun_kodu,
            barkod: barkod || null,
            urun_adi,
            kategori_adi,
            detay: detayRaw || null,
            yeni_mi: parseYeniMi(row[idx.yeni_mi]),
            guncelleme: guncellemeRaw || null,
            varyantlar,
            errors,
            warnings,
            existsInDb: exists,
          });
        }
        setRows(out);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Excel okunamadı.");
        setRows([]);
      }
    };
    reader.onerror = () => {
      toast("error", "Dosya okunamadı.");
      setRows([]);
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileSelected(file: File | null) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
      toast("error", "Yalnızca .xlsx veya .xls dosyası yükleyebilirsiniz.");
      return;
    }
    setFileName(file.name);
    parseWorkbook(file);
  }

  async function topluYukle() {
    if (!firmaId || !canUpload) return;
    const uploadRows = rows.filter((r) => r.errors.length === 0);
    setIsUploading(true);
    setUploadedCount(0);
    setUploadTotal(uploadRows.length);
    try {
      const bodyRows: {
        existing_urun_id: string | null;
        urun: Record<string, unknown>;
        varyantlar: Record<string, unknown>[];
      }[] = [];
      for (const r of uploadRows) {
        const kat = kategoriByName[r.kategori_adi.toLowerCase()];
        if (!kat) throw new Error(`Satır ${r.rowNo}: kategori bulunamadı.`);
        const exists = dbByCode[r.urun_kodu.toLowerCase()];
        bodyRows.push({
          existing_urun_id: exists?.id ?? null,
          urun: {
            kategori_id: kat.id,
            urun_kodu: r.urun_kodu,
            barkod: r.barkod,
            urun_adi: r.urun_adi,
            detay: r.detay,
            yeni_mi: r.yeni_mi,
            guncelleme: r.guncelleme,
            aktif: true,
          },
          varyantlar: r.varyantlar.map((v) => ({
            renk_adi: v.renk_adi,
            stok_durumu: v.stok_durumu,
            stok_miktar: v.stok_miktar,
            stok_birimi: "adet",
            min_siparis: null,
          })),
        });
      }

      const res = await fetch("/api/dashboard/mutate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tip: "excel_yukle",
          payload: { rows: bodyRows },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; imported?: number };
      if (!res.ok || !j.ok) {
        throw new Error(j.error ?? "Toplu yükleme başarısız.");
      }
      setUploadedCount(uploadRows.length);

      toast("success", `${j.imported ?? uploadRows.length} ürün başarıyla yüklendi!`);
      setTimeout(() => {
        router.push("/dashboard/urunler");
      }, 700);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Toplu yükleme başarısız.");
    } finally {
      setIsUploading(false);
    }
  }

  function downloadTemplate() {
    const wb = buildTemplateWorkbook();
    XLSX.writeFile(wb, "urun-toplu-yukleme-sablonu.xlsx");
  }

  if (!ready || !session) return <LoadingScreen />;
  if (loading) return <LoadingScreen label="Hazırlanıyor…" />;

  const progressPct = uploadTotal > 0 ? Math.round((uploadedCount / uploadTotal) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Excel ile toplu ürün yükle
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Tek seferde ürün + varyant verilerini içeri aktarın.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Excel Şablonu İndir
          </button>
          <Link
            href="/dashboard/urunler"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Ürünlere dön
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm text-slate-700">
          Dosyanızı sürükleyip bırakın veya seçin (.xlsx, .xls).
        </p>
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-emerald-400 hover:bg-emerald-50/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFileSelected(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <span className="text-sm font-medium text-slate-700">
            Dosyayı buraya bırakın
          </span>
          <span className="mt-1 text-xs text-slate-500">
            veya tıklayıp bilgisayardan seçin
          </span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
          />
        </label>
        {fileName && (
          <p className="mt-2 text-xs text-slate-500">
            Seçilen dosya: <span className="font-medium text-slate-700">{fileName}</span>
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-800">
              {summary.readyCount} ürün hazır, {summary.warningCount} uyarı,{" "}
              {summary.errorCount} hata
            </p>
            {limitError && (
              <p className="mt-2 text-sm font-medium text-red-700">{limitError}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Limit: {kullanimUrun}/{limitMaxUrun} ürün kullanılıyor.
            </p>
          </div>

          {isUploading && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-sm font-medium text-slate-800">
                {uploadedCount}/{uploadTotal} ürün yüklendi...
              </p>
              <div className="h-3 w-full rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Durum</th>
                  <th className="px-3 py-2 font-medium">Satır</th>
                  <th className="px-3 py-2 font-medium">Ürün Kodu</th>
                  <th className="px-3 py-2 font-medium">Ürün Adı</th>
                  <th className="px-3 py-2 font-medium">Kategori</th>
                  <th className="px-3 py-2 font-medium">Varyantlar</th>
                  <th className="px-3 py-2 font-medium">Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = statusOf(r);
                  const rowClass =
                    s === "error"
                      ? "bg-red-50"
                      : s === "warning"
                        ? "bg-amber-50"
                        : "bg-white";
                  const statusText =
                    s === "error" ? "❌ Hata" : s === "warning" ? "⚠️ Uyarı" : "✅ Hazır";
                  return (
                    <tr key={`r-${r.rowNo}-${r.urun_kodu}`} className={`border-t ${rowClass}`}>
                      <td className="px-3 py-2 font-medium">{statusText}</td>
                      <td className="px-3 py-2">{r.rowNo}</td>
                      <td className="px-3 py-2 font-mono">{r.urun_kodu || "—"}</td>
                      <td className="px-3 py-2">{r.urun_adi || "—"}</td>
                      <td className="px-3 py-2">{r.kategori_adi || "—"}</td>
                      <td className="px-3 py-2">{r.varyantlar.length}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.errors.length > 0 && (
                          <p className="font-medium text-red-700">{r.errors.join(" ")}</p>
                        )}
                        {r.warnings.length > 0 && (
                          <p className="font-medium text-amber-700">{r.warnings.join(" ")}</p>
                        )}
                        {r.errors.length === 0 && r.warnings.length === 0 && (
                          <p className="text-slate-500">Yüklemeye hazır.</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <button
              type="button"
              disabled={!canUpload}
              onClick={() => void topluYukle()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? "Yükleniyor..." : "Toplu Yükle"}
            </button>
            {!canUpload && (
              <p className="mt-1 text-xs text-slate-500">
                Hata bulunan satırlar veya limit aşımları varken yükleme başlatılamaz.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
