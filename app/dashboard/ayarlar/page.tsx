"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { Firma } from "@/lib/types";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function AyarlarPage() {
  const { session, ready, login } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [firma, setFirma] = useState<Firma | null>(null);
  const fid = session?.firma.id;

  useEffect(() => {
    if (!ready || !fid) return;
    let c = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/dashboard/data?tip=ayarlar", {
          credentials: "include",
        });
        const j = (await res.json()) as { ok?: boolean; error?: string; firma?: Firma };
        if (!res.ok || !j.ok || !j.firma) {
          throw new Error(j.error ?? "Firma bilgisi yüklenemedi.");
        }
        if (c) return;
        setFirma(j.firma);
      } catch (e) {
        if (!c) {
          toast("error", e instanceof Error ? e.message : "Firma bilgisi yüklenemedi.");
        }
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [ready, fid, toast]);

  if (!ready || !session) {
    return <LoadingScreen />;
  }

  const f = firma ?? session.firma;
  const logo = f.logo_url;
  if (loading && !firma) {
    return <LoadingScreen label="Ayarlar yükleniyor…" />;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Ayarlar</h1>
      <p className="mt-1 text-sm text-slate-600">Firma bilgileri ve limitler</p>

      <div className="mt-6 max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {logo ? (
            <div className="relative h-16 w-40 shrink-0">
              <Image
                src={logo}
                alt="Logo"
                width={160}
                height={64}
                unoptimized
                className="object-contain"
              />
            </div>
          ) : (
            <div className="flex h-16 w-40 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">
              Logo yok
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{f.firma_adi}</h2>
            <p className="text-sm text-slate-500">Kod: {f.firma_kodu}</p>
            {f.slogan && (
              <p className="mt-1 text-sm text-slate-600">&ldquo;{f.slogan}&rdquo;</p>
            )}
          </div>
        </div>
        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
          <li>Max kategori: {f.max_kategori}</li>
          <li>Max fotoğraf (katalog): {f.max_fotograf}</li>
          <li>Max müşteri: {f.max_musteri}</li>
          <li>Bayi / firma durumu: {f.aktif ? "Aktif" : "Kapalı"}</li>
        </ul>
        <p className="text-xs text-slate-500">
          Limit değişikliği ve logo güncellemeleri ileride bu ekranda düzenlenebilir.
        </p>
        <button
          type="button"
          onClick={async () => {
            if (!fid) return;
            try {
              const res = await fetch("/api/dashboard/data?tip=ayarlar", {
                credentials: "include",
              });
              const j = (await res.json()) as { ok?: boolean; error?: string; firma?: Firma };
              if (!res.ok || !j.ok || !j.firma) {
                toast("error", j.error ?? "Yükleme başarısız.");
                return;
              }
              const next = j.firma;
              setFirma(next);
              login({ firma: next, loggedInAt: new Date().toISOString() });
              toast("success", "Bilgiler tazelendi.");
            } catch (e) {
              toast("error", e instanceof Error ? e.message : "Yükleme başarısız.");
            }
          }}
          className="text-sm text-sky-600 hover:underline"
        >
          Listeyi sunucudan tekrar yükle
        </button>
      </div>
    </div>
  );
}
