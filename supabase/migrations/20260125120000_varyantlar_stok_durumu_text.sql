-- varyantlar.stok_durumu: boolean -> text
-- Yedek alıp Supabase SQL Editor'da çalıştırın. Sütun adı farklıysa düzeltin.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'varyantlar'
      AND column_name = 'stok_durumu'
      AND udt_name = 'bool'
  ) THEN
    ALTER TABLE public.varyantlar
      ALTER COLUMN stok_durumu
        TYPE text
        USING (
          CASE
            WHEN stok_durumu IS TRUE THEN 'var'
            WHEN stok_durumu IS FALSE THEN 'yok'
            ELSE 'var'
          END
        );
  END IF;
END $$;

COMMENT ON COLUMN public.varyantlar.stok_durumu IS
  'var | yok | yakinda — panel: Stokta Var, Stokta Yok, Yakında Stokta';
