-- Eski paket anahtarlarını yeni isimlere taşı (profesyonel→orta, premium→ileri)

UPDATE public.firmalar
  SET aktif_paket = 'orta'
  WHERE lower(trim(coalesce(aktif_paket, ''))) = 'profesyonel';

UPDATE public.firmalar
  SET aktif_paket = 'ileri'
  WHERE lower(trim(coalesce(aktif_paket, ''))) = 'premium';
