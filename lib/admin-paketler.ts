/** Arayüzetiket: Anahtar veritabanındaki `aktif_paket` sütununa yazılır */
export type PaketKodu = "baslangic" | "orta" | "ileri" | "enterprise";

export const PAKET_DROPDOWN: { value: PaketKodu; etiket: string }[] = [
  { value: "baslangic", etiket: "Başlangıç" },
  { value: "orta", etiket: "Orta Seviye" },
  { value: "ileri", etiket: "İleri Seviye" },
  { value: "enterprise", etiket: "Enterprise" },
];

const ESKI_PAKET_MAP: Readonly<Record<string, PaketKodu>> = {
  profesyonel: "orta",
  premium: "ileri",
};

/** Eski `aktif_paket` değerlerini yeni koda indirger (yükleme/görüntüleme) */
export function aktifPaketKoduCoz(k: string | null | undefined): PaketKodu {
  if (k == null || k === "") return "baslangic";
  if (k in ESKI_PAKET_MAP) return ESKI_PAKET_MAP[k]!;
  if (PAKET_DROPDOWN.some((p) => p.value === (k as PaketKodu))) {
    return k as PaketKodu;
  }
  return "baslangic";
}

type PaketSatirSayisal = {
  tip: "sayisal";
  kod: Exclude<PaketKodu, "enterprise">;
  ad: string;
  kategori: number;
  urun: number;
  fotograf: number;
  ai_gunluk: number;
};

type PaketSatirOzel = {
  tip: "ozel";
  kod: "enterprise";
  ad: "Enterprise";
};

export type PaketBilgiSatir = PaketSatirSayisal | PaketSatirOzel;

export const PAKET_BILGI_TABLO: PaketBilgiSatir[] = [
  {
    tip: "sayisal",
    kod: "baslangic",
    ad: "Başlangıç",
    kategori: 5,
    urun: 100,
    fotograf: 500,
    ai_gunluk: 5,
  },
  {
    tip: "sayisal",
    kod: "orta",
    ad: "Orta Seviye",
    kategori: 10,
    urun: 200,
    fotograf: 1500,
    ai_gunluk: 10,
  },
  {
    tip: "sayisal",
    kod: "ileri",
    ad: "İleri Seviye",
    kategori: 15,
    urun: 400,
    fotograf: 2500,
    ai_gunluk: 20,
  },
  { tip: "ozel", kod: "enterprise", ad: "Enterprise" },
];

/** Paket değişince doldurulacak sınırlar; Enterprise’da manuel, `null` döner. */
export function paketOtomatikLimitler(
  kod: PaketKodu,
): {
  max_kategori: number;
  max_urun: number;
  max_fotograf: number;
  max_ai_gunluk: number;
} | null {
  switch (kod) {
    case "baslangic":
      return { max_kategori: 5, max_urun: 100, max_fotograf: 500, max_ai_gunluk: 5 };
    case "orta":
      return {
        max_kategori: 10,
        max_urun: 200,
        max_fotograf: 1500,
        max_ai_gunluk: 10,
      };
    case "ileri":
      return {
        max_kategori: 15,
        max_urun: 400,
        max_fotograf: 2500,
        max_ai_gunluk: 20,
      };
    case "enterprise":
      return null;
  }
}
