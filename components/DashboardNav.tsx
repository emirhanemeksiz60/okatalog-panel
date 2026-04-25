"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/urunler", label: "Ürünler" },
  { href: "/dashboard/kategoriler", label: "Kategoriler" },
  { href: "/dashboard/musteriler", label: "Müşteriler" },
  { href: "/dashboard/ayarlar", label: "Ayarlar" },
];

export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();

  return (
    <nav className="space-y-1" aria-label="Yan menü">
      {links.map((l) => {
        const active =
          l.href === "/dashboard"
            ? path === "/dashboard"
            : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-sky-100 text-sky-900"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileMenuButton({
  onClick,
  open,
}: {
  onClick: () => void;
  open: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-200 p-2 text-slate-700 md:hidden"
      aria-expanded={open}
      aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
    >
      <span className="text-lg" aria-hidden>
        {open ? "✕" : "☰"}
      </span>
    </button>
  );
}

export function useMobileMenu() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, close: () => setOpen(false) } as const;
}
