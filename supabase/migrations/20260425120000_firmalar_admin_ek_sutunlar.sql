-- İsteğe bağlı: eski veritabanında eksikse sadece bu iki limit sütununu ekle
alter table if exists public.firmalar
  add column if not exists max_urun integer default 100;

alter table if exists public.firmalar
  add column if not exists max_varyant integer default 500;

update public.firmalar
  set max_urun = coalesce(max_urun, 100)
  where max_urun is null;

update public.firmalar
  set max_varyant = coalesce(max_varyant, 500)
  where max_varyant is null;
