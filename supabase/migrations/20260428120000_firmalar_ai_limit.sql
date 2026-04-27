-- Günlük AI limiti ve bugünkü sayaç

ALTER TABLE IF EXISTS public.firmalar
  ADD COLUMN IF NOT EXISTS max_ai_gunluk integer NOT NULL DEFAULT 5;
ALTER TABLE IF EXISTS public.firmalar
  ADD COLUMN IF NOT EXISTS ai_kullanim_bugun integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.firmalar.max_ai_gunluk IS
  'Günlük AI (LLM) çağrı hakkı üst sınırı.';

COMMENT ON COLUMN public.firmalar.ai_kullanim_bugun IS
  'Bugüne ait tüketilen AI hakları; günlük (ör. cron) veya uygulama tarafında sıfırlanabilir.';
