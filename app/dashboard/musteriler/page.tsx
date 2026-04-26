"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { musteriSifreBcryptUret } from "@/lib/musteri-sifre";
import { MUSTERI_LISTE_SUTUNLARI } from "@/lib/musteri-sutunlar";
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

export default function MusterilerPage() {
  const { session, ready } = useAuth();
  const { show: toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Musteri[]>([]);
  const [kod, setKod] = useState("");
  const [ad, setAd] = useState("");
  const [sifre, setSifre] = useState("");
  const [limitB, setLimitB] = useState<FirmaLimitBilgisi | null>(null);

  const firmaId = session?.firma.id;

  const load = useCallback(async () => {
    if (!firmaId) return;
    setLoading(true);
    try {
      const [mRes, lim] = await Promise.all([
        supabase
          .from("musteriler")
          .select(MUSTERI_LISTE_SUTUNLARI)
          .eq("firma_id", firmaId)
          .order("musteri_kodu", { ascending: true }),
        yukleFirmaLimitBilgisi(firmaId),
      ]);
      if (mRes.error) throw mRes.error;
      setLimitB(lim);
      setRows((mRes.data as Musteri[]) ?? []);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Müşteriler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [firmaId, toast]);

  useEffect(() => {
    if (!ready || !firmaId) return;
    queueMicrotask(() => {
      void load();
    });
  }, [ready, firmaId, load]);

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
      const sifreHash = await musteriSifreBcryptUret(s);
      const { data, error } = await supabase
        .from("musteriler")
        .insert({
          firma_id: firmaId!,
          musteri_kodu: k,
          musteri_adi: a,
          sifre: sifreHash,
          aktif: true,
        })
        .select(MUSTERI_LISTE_SUTUNLARI)
        .single();
      if (error) throw error;
      setRows((r) =>
        [...r, data as Musteri].sort((x, y) =>
          x.musteri_kodu.localeCompare(y.musteri_kodu),
        ),
      );
      setKod("");
      setAd("");
      setSifre("");
      toast("success", "Müşteri eklendi.");
      void load();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Eklenemedi.");
    }
  }

  async function sil(m: Musteri) {
    if (!window.confirm(`“${m.musteri_adi}” silinsin mi?`)) return;
    try {
      const { error } = await supabase.from("musteriler").delete().eq("id", m.id);
      if (error) throw error;
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
        Kataloğu görüntüleyen bayiler / müşteriler. Şifreler Supabase (bcrypt) üzerinde
        hash’lenir; bu sayfada şifre metni listelenmez.
      </p>
      {limitB && (
        <div className="mt-3 max-w-3xl">
          <LimitBilgiCubugu bilgi={limitB} sadece={["musteri"]} />
        </div>
      )}

      <form
        onSubmit={ekleMusteri}
        className="mt-6 max-w-3xl space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid sm:grid-cols-2 sm:items-end sm:gap-3 sm:space-y-0 lg:grid-cols-4"
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
              <th className="min-w-[10rem] px-4 py-3 font-medium">Şifre değiştir</th>
              <th className="w-20 px-4 py-3 font-medium">Aktif</th>
              <th className="w-32 px-4 py-3 text-right font-medium">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MusteriRow({
  m,
  onGuncellendi,
  onSil,
  toast,
}: {
  m: Musteri;
  onGuncellendi: () => void;
  onSil: () => void;
  toast: (type: "success" | "error", message: string) => void;
}) {
  const [kod, setKod] = useState(m.musteri_kodu);
  const [ad, setAd] = useState(m.musteri_adi);
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
      const payload: Record<string, string | boolean> = {
        musteri_kodu: kod.trim(),
        musteri_adi: ad.trim(),
        aktif: m.aktif,
      };
      if (sifre.trim().length) {
        const h = await musteriSifreBcryptUret(sifre.trim());
        payload.sifre = h;
      }
      const { error } = await supabase
        .from("musteriler")
        .update(payload)
        .eq("id", m.id);
      if (error) throw error;
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
            const { error } = await supabase
              .from("musteriler")
              .update({ aktif: checked })
              .eq("id", m.id);
            if (error) {
              toast("error", error.message);
              return;
            }
            onGuncellendi();
            toast("success", "Durum güncellendi.");
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
