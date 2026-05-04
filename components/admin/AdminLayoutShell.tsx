"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAdminAuth } from "@/context/admin-auth-context";
import { LoadingScreen } from "@/components/LoadingScreen";

const nav: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/firmalar", label: "Firmalar" },
  { href: "/admin/paketler", label: "Paketler" },
];

export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
  const { session, ready, logout } = useAdminAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (ready && !session) {
      router.replace("/admin/giris");
    }
  }, [ready, session, router]);

  if (!ready) {
    return (
      <div className="min-h-svh bg-slate-950 text-slate-100">
        <LoadingScreen label="Oturum…" />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="min-h-svh bg-slate-950 text-slate-100">
        <LoadingScreen label="Girişe yönlendiriliyor…" />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight text-white">
            oKatalog Admin Paneli
          </h1>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                await logout();
                router.replace("/admin/giris");
              })();
            }}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Çıkış
          </button>
        </div>
      </header>
      <div className="mx-auto flex max-w-6xl flex-1 flex-col gap-4 p-4 md:flex-row md:gap-6 md:px-6 md:py-5">
        <aside className="w-full shrink-0 md:w-48">
          <nav className="flex flex-wrap gap-1 md:flex-col" aria-label="Admin menü">
            {nav.map((n) => {
              const a =
                n.href === "/admin"
                  ? path === "/admin"
                  : path === n.href || path.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    a
                      ? "bg-amber-500/20 text-amber-200"
                      : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1" key={path}>
          {children}
        </main>
      </div>
    </div>
  );
}
