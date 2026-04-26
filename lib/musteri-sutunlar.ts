/**
 * Panel listeleri ve insert/update yanıtında dönen alan — `sifre` (hash) asla
 * yüklenmez, istemciye düşmez.
 */
export const MUSTERI_LISTE_SUTUNLARI =
  "id, firma_id, musteri_kodu, musteri_adi, aktif" as const;
