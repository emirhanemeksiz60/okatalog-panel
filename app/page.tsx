"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithFirma } from "@/lib/supabase-firma";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/context/toast-context";
import { LoadingScreen } from "@/components/LoadingScreen";

export default function LoginPage() {
  const router = useRouter();
  const { session, ready, login } = useAuth();
  const { show: toast } = useToast();
  const [kod, setKod] = useState("");
  const [sifre, setSifre] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (ready && session) {
      router.replace("/dashboard");
    }
  }, [ready, session, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await signInWithFirma(kod, sifre);
      if (res.error || !res.data) {
        toast("error", res.error ?? "Giriş yapılamadı.");
        return;
      }
      login(res.data);
      toast("success", "Giriş başarılı.");
      router.push("/dashboard");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Giriş hatası.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <LoadingScreen label="Yükleniyor…" />;
  }
  if (session) {
    return <LoadingScreen label="Panele yönlendiriliyor…" />;
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-b from-sky-50 to-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg shadow-slate-200/50">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            oKatalog
          </h1>
          <p className="mt-1 text-sm text-slate-600">Yönetim paneli girişi</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700"
              htmlFor="firma"
            >
              Firma kodu
            </label>
            <input
              id="firma"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={kod}
              onChange={(e) => setKod(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-slate-700"
              htmlFor="sifre"
            >
              Şifre
            </label>
            <input
              id="sifre"
              type="password"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
          >
            {submitting ? "Giriliyor…" : "Giriş yap"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          Demo: firma <code className="rounded bg-slate-100 px-1">cuzdancim</code>{" "}
          / şifre <code className="rounded bg-slate-100 px-1">admin123</code>
        </p>
        <p className="mt-3 text-center">
          <a
            href="/admin/giris"
            className="text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-900"
          >
            Admin girişi
          </a>
        </p>
      </div>
    </div>
  );
}
