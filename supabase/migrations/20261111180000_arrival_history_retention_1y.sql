-- Retención de históricos de arribos: 1 año (decisión del responsable, 2026-11-11, docs/decisions.md D18).
--
-- * Observaciones crudas: 365 días por defecto (antes 90).
-- * Llegadas inferidas (derivadas, sin datos personales): el doble de la retención cruda, para comparar temporadas.
-- * Se programa con pg_cron sólo si la extensión existe (en Supabase se habilita desde el panel). Sin pg_cron
--   la purga queda disponible para correrla a mano o desde otro scheduler.

CREATE OR REPLACE FUNCTION public.purge_arrival_history(retention_days integer DEFAULT 365)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed bigint;
BEGIN
  IF retention_days < 7 THEN
    RAISE EXCEPTION 'retention_days debe ser >= 7';
  END IF;
  DELETE FROM public.arrival_observations WHERE observed_at < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM public.inferred_arrivals WHERE arrived_at < now() - make_interval(days => retention_days * 2);
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_arrival_history(integer) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-arrival-history';
    PERFORM cron.schedule('purge-arrival-history', '17 4 * * *', 'SELECT public.purge_arrival_history(365)');
  END IF;
END;
$$;
