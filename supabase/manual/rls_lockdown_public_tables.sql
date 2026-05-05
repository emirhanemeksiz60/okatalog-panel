/*
  ============================================================================
  oKatalog Panel — Genel şema kilidi (manuel: Supabase SQL Editor'da çalıştırın)

  ÖNEMLI
  - Bu script anon / authenticated için tabloları kilitler; service_role RLS'i
    atlasın (sunucuda SERVICE_ROLE kullanın).
  - Panel şu anda browser'da NEXT_PUBLIC_SUPABASE_ANON_KEY ile bağlanıyorsa bu
    script sonrası tüm doğrudan istemci sorguları başarısız olur → veri işlemini
    yalnızca API route + service_role tarafına taşıdıktan sonra uygulayın.

  push_tokens için SELECT/UPDATE: musteri_id = auth.uid()
  Mobil tarafta Supabase ile giriş (ör. Anonymous veya müşteri id = auth.uid())
  yoksa bu satırlar görülmez/güncellenemez — kimlik modelinize göre USING ifadesini
  güncelleyin (JWT custom claim vb.).

  lib/supabase.ts        → NEXT_PUBLIC_SUPABASE_ANON_KEY (istemci için)
  lib/supabase-firma.ts  → SUPABASE_SERVICE_ROLE_KEY (yalnız createFirmaServiceRoleClient)
  ============================================================================
*/

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) İlgili tüm politikaları kaldır
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
  tablolar text[] := ARRAY[
    'aktivite_logu',
    'firmalar',
    'fiyat_liste_kalemleri',
    'fiyat_listeleri',
    'kargo_gorselleri',
    'kategoriler',
    'musteriler',
    'push_tokens',
    'siparis_gecmisi',
    'siparis_kalemleri',
    'siparisler',
    'urunler',
    'varyantlar'
  ];
BEGIN
  FOR pol IN
    SELECT p.schemaname, p.tablename, p.policyname
    FROM pg_policies AS p
    WHERE p.schemaname = 'public'
      AND p.tablename = ANY(tablolar)
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2) RLS etkin / anon + authenticated haklarını sıfırla
-- ---------------------------------------------------------------------------
ALTER TABLE public.aktivite_logu           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmalar                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiyat_liste_kalemleri   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiyat_listeleri         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kargo_gorselleri        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kategoriler             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musteriler              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siparis_gecmisi         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siparis_kalemleri       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siparisler              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urunler                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.varyantlar              ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
  tablolar text[] := ARRAY[
    'aktivite_logu',
    'firmalar',
    'fiyat_liste_kalemleri',
    'fiyat_listeleri',
    'kargo_gorselleri',
    'kategoriler',
    'musteriler',
    'push_tokens',
    'siparis_gecmisi',
    'siparis_kalemleri',
    'siparisler',
    'urunler',
    'varyantlar'
  ];
BEGIN
  FOREACH t IN ARRAY tablolar
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
  END LOOP;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3) push_tokens istisnası: INSERT herkese açık; SELECT/UPDATE yalnız "kendi" satır
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON TABLE public.push_tokens TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.push_tokens TO authenticated;

CREATE POLICY "push_tokens_insert_anon_authenticated"
  ON public.push_tokens
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "push_tokens_select_own_anon_authenticated"
  ON public.push_tokens
  FOR SELECT
  TO anon, authenticated
  USING (
    musteri_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND musteri_id = auth.uid()
  );

CREATE POLICY "push_tokens_update_own_anon_authenticated"
  ON public.push_tokens
  FOR UPDATE
  TO anon, authenticated
  USING (
    musteri_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND musteri_id = auth.uid()
  )
  WITH CHECK (
    musteri_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND musteri_id = auth.uid()
  );


-- ---------------------------------------------------------------------------
-- Diğer tablolar: ek politika tanımlanmıyor (anon/authenticated için erişim yok).
-- Sequence varsa mobil INSERT için gerekebilir (id serial ise):
--   GRANT USAGE, SELECT ON SEQUENCE public.push_tokens_id_seq TO anon, authenticated;
-- (tablo yapınıza göre sequence adını kontrol edin.)
-- ---------------------------------------------------------------------------

COMMIT;
