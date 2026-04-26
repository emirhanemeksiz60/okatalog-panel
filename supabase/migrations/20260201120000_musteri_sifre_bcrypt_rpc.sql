-- pgcrypto: bcrypt (Supabase: genelde `extensions` şeması)
create extension if not exists pgcrypto with schema extensions;

-- Şifre üret: düz metin (min 4 karakter) -> bcrypt
create or replace function public.musteri_sifre_hash(p_plain text)
returns text
language plpgsql
set search_path = public, extensions
as $$
begin
  if p_plain is null or length(trim(p_plain)) < 4 then
    raise exception 'Şifre en az 4 karakter olmalı';
  end if;
  return extensions.crypt(trim(p_plain), extensions.gen_salt('bf', 10));
end;
$$;

-- Giriş / doğrulama: düz metin + `musteriler.sifre` sütunundaki bcrypt hash
create or replace function public.musteri_sifre_dogrula(p_plain text, p_stored text)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $$
begin
  if p_plain is null or p_stored is null or length(p_stored) = 0 then
    return false;
  end if;
  return extensions.crypt(p_plain, p_stored) = p_stored;
end;
$$;

revoke all on function public.musteri_sifre_hash(text) from public;
revoke all on function public.musteri_sifre_dogrula(text, text) from public;

grant execute on function public.musteri_sifre_hash(text) to anon, authenticated, service_role;
grant execute on function public.musteri_sifre_dogrula(text, text) to anon, authenticated, service_role;

comment on function public.musteri_sifre_hash(text) is
  'MUSTERILER.sifre sütununa yazılacak bcrypt hash; düz metin yollamayın, yalnız uygulamadan.';

comment on function public.musteri_sifre_dogrula(text, text) is
  'Müşteri girişi: şifre ile hash karşılaştırması.';
