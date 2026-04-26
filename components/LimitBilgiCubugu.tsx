import type { FirmaLimitBilgisi } from "@/lib/firma-limit-usage";

const satir: { alan: keyof FirmaLimitBilgisi["kullanim"]; etiket: string }[] = [
  { alan: "kategori", etiket: "Kategoriler" },
  { alan: "musteri", etiket: "Müşteriler" },
  { alan: "urun", etiket: "Ürünler" },
  { alan: "fotograf", etiket: "Fotoğraflar" },
];

type Props = {
  bilgi: FirmaLimitBilgisi;
  /** Sadece bu alan etiketleri; boş = hepsi */
  sadece?: (typeof satir)[number]["alan"][];
  className?: string;
};

export function LimitBilgiCubugu({ bilgi, sadece, className = "" }: Props) {
  const goster = sadece?.length
    ? satir.filter((s) => sadece.includes(s.alan))
    : satir;
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-sm text-slate-700 ${className}`}
      role="status"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Limit durumu
      </p>
      <ul className="mt-1.5 space-y-0.5 text-slate-800">
        {goster.map(({ alan, etiket }) => {
          const m = bilgi.limits;
          const k = bilgi.kullanim;
          const maks =
            alan === "kategori"
              ? m.max_kategori
              : alan === "musteri"
                ? m.max_musteri
                : alan === "urun"
                  ? m.max_urun
                  : m.max_fotograf;
          const me = k[alan];
          return (
            <li key={alan} className="font-medium tabular-nums">
              {etiket}: {me}/{maks} kullanıldı
            </li>
          );
        })}
      </ul>
    </div>
  );
}
