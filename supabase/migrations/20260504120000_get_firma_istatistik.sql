-- Firma bazlı sayılar (tek sorgu / tek RPC). Panel: lib/admin-aggregates firmaBasiIstatikler.
-- fotograf_toplam: varyant.gorsel_url alanındaki virgülle ayrılmış URL adedi (boş parçalar sayılmaz).

CREATE OR REPLACE FUNCTION public.get_firma_istatistik(p_firma_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  j json;
BEGIN
  WITH urunler_f AS (
    SELECT u.id
    FROM public.urunler u
    WHERE u.firma_id = p_firma_id
      AND u.deleted_at IS NULL
  )
  SELECT json_build_object(
    'urun_sayisi', (SELECT count(*)::bigint FROM urunler_f),
    'musteri_sayisi', (
      SELECT count(*)::bigint
      FROM public.musteriler m
      WHERE m.firma_id = p_firma_id
        AND m.deleted_at IS NULL
    ),
    'kategori_sayisi', (
      SELECT count(*)::bigint
      FROM public.kategoriler k
      WHERE k.firma_id = p_firma_id
        AND k.deleted_at IS NULL
    ),
    'varyant_sayisi', (
      SELECT count(*)::bigint
      FROM public.varyantlar v
      WHERE v.urun_id IN (SELECT id FROM urunler_f)
    ),
    'fotograf_toplam', (
      SELECT coalesce(sum(x.cnt), 0)::bigint
      FROM (
        SELECT (
          SELECT count(*)::bigint
          FROM unnest(string_to_array(trim(coalesce(v.gorsel_url, '')), ',')) AS t(part)
          WHERE length(trim(coalesce(t.part, ''))) > 0
        ) AS cnt
        FROM public.varyantlar v
        WHERE v.urun_id IN (SELECT id FROM urunler_f)
      ) x
    )
  )
  INTO j;

  RETURN j;
END;
$$;
