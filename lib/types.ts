export type Firma = {
  id: string;
  firma_kodu: string;
  firma_adi: string;
  logo_url: string | null;
  slogan: string | null;
  max_kategori: number;
  max_fotograf: number;
  max_musteri: number;
  aktif: boolean;
};

export type Musteri = {
  id: string;
  firma_id: string;
  musteri_kodu: string;
  musteri_adi: string;
  sifre: string;
  aktif: boolean;
};

export type Kategori = {
  id: string;
  firma_id: string;
  kategori_adi: string;
  sira: number;
  ozel: boolean;
  aktif: boolean;
};

export type Urun = {
  id: string;
  firma_id: string;
  kategori_id: string;
  urun_kodu: string;
  urun_adi: string;
  detay: string | null;
  yeni_mi: boolean;
  guncelleme: string | null;
  aktif: boolean;
};

export type Varyant = {
  id: string;
  urun_id: string;
  renk_adi: string;
  renk_hex: string | null;
  gorsel_url: string | null;
  stok_durumu: string | null;
};

export type AuthSession = {
  firma: Firma;
  loggedInAt: string;
};
