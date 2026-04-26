-- Firma paneli girişi: bcrypt (pgcrypto) — `panel_sifre` sadece server-side, RPC
alter table if exists public.firmalar
  add column if not exists panel_sifre text;

comment on column public.firmalar.panel_sifre is
  'Bcrypt parola özeti. NULL/boş ise panel girişi verify_firma_password ile sönük kalır.';

-- Doğrulama: (firma_kodu + düz parola) -> eşleşen aktif satır id veya null
create or replace function public.verify_firma_password(
  p_firma_kodu text,
  p_sifre text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f_id uuid;
  phash text;
begin
  if p_firma_kodu is null or p_sifre is null or length(trim(p_sifre)) = 0 then
    return null;
  end if;
  select f.id, f.panel_sifre
    into f_id, phash
  from public.firmalar f
  where lower(trim(f.firma_kodu)) = lower(trim(p_firma_kodu))
    and coalesce(f.aktif, true);
  if f_id is null then
    return null;
  end if;
  if phash is null or length(trim(phash)) = 0 then
    return null;
  end if;
  if extensions.crypt(p_sifre, phash) = phash then
    return f_id;
  end if;
  return null;
end;
$$;

revoke all on function public.verify_firma_password(text, text) from public;
grant execute on function public.verify_firma_password(text, text) to anon, authenticated, service_role;

comment on function public.verify_firma_password(text, text) is
  'Esnaf girişi: firma kodu + düz metin; başarıda firma uuid, aksi null.';
