"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAdminAuth } from "@/context/admin-auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { PaketKodu } from "@/lib/admin-paketler";

const D = {
  max_kategori: 10,
  max_musteri: 50,
  max_urun: 100,
  max_varyant: 500,
  max_fotograf: 500,
  max_ai_gunluk: 5,
  aktif_paket: "baslangic" as PaketKodu,
};

export default function YeniFirma() {
  const { session, ready } = useAdminAuth();
  const { show: toast } = useToast();
  const router = useRouter();
  const [k, setK] = useState("");
  const [ad, setAd] = useState("");
  const [slogan, setSlogan] = useState("");
  const [bek, setBek] = useState(false);

  if (!ready) return <LoadingScreen label="Oturum…" />;
  if (!session) return <LoadingScreen label="Girişe yönlendiriliyor…" />;

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!k.trim() || !ad.trim()) {
      toast("error", "Firma kodu ve adı zorunludur.");
      return;
    }
    setBek(true);
    try {
      const { data, error } = await supabase
        .from("firmalar")
        .insert({
          firma_kodu: k.trim().toLowerCase(),
          firma_adi: ad.trim(),
          slogan: slogan.trim() || null,
          logo_url: null,
          max_kategori: D.max_kategori,
          max_musteri: D.max_musteri,
          max_urun: D.max_urun,
          max_varyant: D.max_varyant,
          max_fotograf: D.max_fotograf,
          max_ai_gunluk: D.max_ai_gunluk,
          ai_kullanim_bugun: 0,
          aktif_paket: D.aktif_paket,
          paket_bitis_tarihi: null,
          notlar: null,
          aktif: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast("success", "Firma eklendi.");
      router.push(`/admin/firmalar/${(data as { id: string }).id}`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Kayıt hatası");
    } finally {
      setBek(false);
    }
  }

  return (
    <div>
      <div className="mb-4 text-sm text-slate-500">
        <Link href="/admin/firmalar" className="text-amber-400/90 hover:underline">
          ← Firmalar
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-white">Yeni firma ekle</h1>
      <p className="mt-1 text-sm text-slate-500">
        Varsayılan limitler ve Başlangıç paketi atanır. Esnaf parolası{" "}
        <code className="text-amber-200/80">panel_sifre</code> (bcrypt) ile{" "}
        <code className="text-amber-200/80">verify_firma_password</code> RPC: Supabase
        &apos;de <code className="text-amber-200/80">musteri_sifre_hash</code> ile
        &nbsp;set edin.
      </p>
      <form
        onSubmit={kaydet}
        className="mt-6 max-w-md space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
      >
        <label className="block text-sm text-slate-300">
          Firma kodu
          <input
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
            value={k}
            onChange={(e) => setK(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm text-slate-300">
          Firma adı
          <input
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm text-slate-300">
          Slogan
          <input
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white"
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="submit"
            disabled={bek}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400 disabled:opacity-50"
          >
            {bek ? "Kaydediliyor…" : "Oluştur"}
          </button>
          <Link
            href="/admin/firmalar"
            className="inline-flex items-center rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            İptal
          </Link>
        </div>
      </form>
    </div>
  );
}
