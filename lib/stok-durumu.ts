/** Varyantlar.stok_durumu — text alanı (Supabase) */
export type StokKodu = "var" | "yok" | "yakinda";

export const STOK_DURUMU_SECENEKLERI: { kod: StokKodu; metin: string }[] = [
  { kod: "var", metin: "Stokta Var" },
  { kod: "yok", metin: "Stokta Yok" },
  { kod: "yakinda", metin: "Yakında Stokta" },
];

export const STOK_DURUMU_VARSAYILAN: StokKodu = "var";

const GECERLI: Set<StokKodu> = new Set(["var", "yok", "yakinda"]);

/** DB / formdan gelen değeri koda indirger; boolean, eski metin veya yeni kodlar. */
export function stokDegeriToKod(raw: unknown): StokKodu {
  if (raw === true) return "var";
  if (raw === false) return "yok";
  if (raw === null || raw === undefined) return STOK_DURUMU_VARSAYILAN;
  const t = String(raw).trim().toLowerCase();
  if (GECERLI.has(t as StokKodu)) return t as StokKodu;
  if (t === "stokta" || t === "stokta var") return "var";
  return STOK_DURUMU_VARSAYILAN;
}

export function stokKoduToMetin(k: StokKodu): string {
  return (
    STOK_DURUMU_SECENEKLERI.find((s) => s.kod === k)?.metin ??
    STOK_DURUMU_SECENEKLERI[0]!.metin
  );
}

const ETIKET_SINIF: Record<StokKodu, string> = {
  var: "bg-emerald-100 text-emerald-900",
  yok: "bg-red-100 text-red-900",
  yakinda: "bg-orange-100 text-orange-900",
};

export function stokKoduToEtiketClassName(k: StokKodu): string {
  return ETIKET_SINIF[k] ?? ETIKET_SINIF.var;
}
