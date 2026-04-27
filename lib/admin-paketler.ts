/** Arayüzetiket: Anahtar veritabanındaki `aktif_paket` sütununa yazılır */
export type PaketKodu =
  | "baslangic"
  | "profesyonel"
  | "premium"
  | "enterprise";

export const PAKET_DROPDOWN: { value: PaketKodu; etiket: string }[] = [
  { value: "baslangic", etiket: "Başlangıç" },
  { value: "profesyonel", etiket: "Profesyonel" },
  { value: "premium", etiket: "Premium" },
  { value: "enterprise", etiket: "Enterprise" },
];

export const PAKET_BILGI_TABLO: {
  kod: PaketKodu;
  ad: string;
  kategori: number;
  musteri: number;
  urun: number;
  fotograf: number;
  /** Günlük AI (LLM) çağrı hakkı (referans) */
  ai_gunluk: number;
  /** Paketler tablosundaki açıklama; örn. Enterprise fiyat notu */
  not?: string;
}[] = [
  {
    kod: "baslangic",
    ad: "Başlangıç",
    kategori: 10,
    musteri: 50,
    urun: 100,
    fotograf: 500,
    ai_gunluk: 5,
  },
  {
    kod: "profesyonel",
    ad: "Profesyonel",
    kategori: 20,
    musteri: 200,
    urun: 500,
    fotograf: 2000,
    ai_gunluk: 20,
  },
  {
    kod: "premium",
    ad: "Premium",
    kategori: 50,
    musteri: 500,
    urun: 2000,
    fotograf: 10000,
    ai_gunluk: 50,
  },
  {
    kod: "enterprise",
    ad: "Enterprise",
    kategori: 100,
    musteri: 2000,
    urun: 10000,
    fotograf: 50000,
    ai_gunluk: 200,
    not: "Özel fiyatlandırma - İletişime geçin",
  },
];
