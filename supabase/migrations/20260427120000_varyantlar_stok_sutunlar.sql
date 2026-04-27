-- Varyant satırlarında stok miktarı, birim, minimum sipariş (opsiyonel)

ALTER TABLE public.varyantlar
  ADD COLUMN IF NOT EXISTS stok_miktar INTEGER,
  ADD COLUMN IF NOT EXISTS stok_birimi TEXT NOT NULL DEFAULT 'adet',
  ADD COLUMN IF NOT EXISTS min_siparis INTEGER;

COMMENT ON COLUMN public.varyantlar.stok_miktar IS
  'Opsiyonel: mevcut stok adedi. 0 = stok yok.';

COMMENT ON COLUMN public.varyantlar.stok_birimi IS
  'Stok birimi: adet, düzine, kutu, çift, paket, koli.';

COMMENT ON COLUMN public.varyantlar.min_siparis IS
  'Opsiyonel: minimum sipariş adedi.';
