"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminGirisBeklenti,
  getAdminFromStorage,
  yeniAdminSession,
} from "@/lib/admin-auth";
import { useAdminAuth } from "@/context/admin-auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function AdminGirisPage() {
  const router = useRouter();
  const { session, ready, login } = useAdminAuth();
  const { show: toast } = useToast();
  const [kadi, setKadi] = useState(() => process.env.ADMIN_USERNAME?.trim() ?? "");
  const [sifre, setSifre] = useState("");
  const [g, setG] = useState(false);

  useEffect(() => {
    if (ready && (session || getAdminFromStorage())) {
      const s = session ?? getAdminFromStorage();
      if (s) {
        queueMicrotask(() => router.replace("/admin"));
      }
    }
  }, [ready, session, router]);

  async function gonder(e: React.FormEvent) {
    e.preventDefault();
    setG(true);
    try {
      if (!adminGirisBeklenti(kadi, sifre)) {
        toast("error", "Kullanıcı adı veya şifre hatalı.");
        return;
      }
      const s = yeniAdminSession();
      login(s);
      toast("success", "Admin girişi başarılı.");
      router.push("/admin");
    } finally {
      setG(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <LoadingScreen label="Yükleniyor…" />
      </div>
    );
  }
  if (session) {
    return <LoadingScreen label="Panele yönlendiriliyor…" />;
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-xl">
        <h1 className="text-center text-xl font-bold text-white">Admin Girişi</h1>
        <p className="mb-6 text-center text-sm text-slate-400">oKatalog — süper yönetici</p>
        <form onSubmit={gonder} className="space-y-4">
          <div>
            <label
              className="mb-1.5 block text-sm text-slate-300"
              htmlFor="a-k"
            >
              Kullanıcı adı
            </label>
            <input
              id="a-k"
              className="w-full rounded-lg border border-slate-600 bg-slate-950/50 px-3 py-2.5 text-sm text-white"
              value={kadi}
              onChange={(e) => setKadi(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-slate-300" htmlFor="a-s">
              Şifre
            </label>
            <input
              id="a-s"
              type="password"
              className="w-full rounded-lg border border-slate-600 bg-slate-950/50 px-3 py-2.5 text-sm text-white"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={g}
            className="w-full rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
          >
            {g ? "Giriliyor…" : "Giriş yap"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          <a href="/" className="text-amber-500/90 hover:underline">
            ← Firma paneli girişi
          </a>
        </p>
      </div>
    </div>
  );
}
