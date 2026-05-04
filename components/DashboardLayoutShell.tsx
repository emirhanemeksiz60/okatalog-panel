"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import {
  DashboardNav,
  MobileMenuButton,
  useMobileMenu,
} from "@/components/DashboardNav";
import { LoadingScreen } from "@/components/LoadingScreen";

export function DashboardLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, ready, logout } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const { open, setOpen } = useMobileMenu();

  useEffect(() => {
    if (!ready) return;
    if (!session) {
      router.replace("/");
    }
  }, [ready, session, router]);

  if (!ready) {
    return <LoadingScreen label="Oturum denetleniyor…" />;
  }
  if (!session) {
    return <LoadingScreen label="Giriş sayfasına yönlendiriliyor…" />;
  }

  return (
    <div className="min-h-svh flex flex-col bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <MobileMenuButton onClick={() => setOpen((o) => !o)} open={open} />
            <h1 className="truncate text-lg font-semibold text-slate-900">
              oKatalog Panel
            </h1>
          </div>
          <div className="flex min-w-0 max-w-full items-center gap-2 sm:gap-4">
            <span
              className="hidden min-w-0 max-w-[50vw] truncate text-sm text-slate-600 sm:block"
              title={session.firma.firma_adi}
            >
              {session.firma.firma_adi}
            </span>
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/");
              }}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Çıkış
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-slate-200 bg-slate-50 p-3 md:hidden">
            <p className="mb-2 truncate text-sm text-slate-600">
              {session.firma.firma_adi}
            </p>
            <DashboardNav onNavigate={() => setOpen(false)} />
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:flex-row md:items-start md:gap-6 md:px-6 md:py-6">
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-20 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <DashboardNav />
          </div>
        </aside>
        <main className="min-w-0 flex-1" key={path}>
          {children}
        </main>
      </div>
    </div>
  );
}
