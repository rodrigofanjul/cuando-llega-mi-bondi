-- Históricos de arribos (Fase 4), compatibles con el motor offline (Fase 9, docs/decisions.md D10).
--
-- Principios:
-- * Filas CRUDAS con timestamp: nada derivado (feriado, franja, demora) se guarda en la fila, para poder
--   reconstruir llegadas, headways y distribuciones sin fuga de información futura al entrenar.
-- * Sin datos personales: no hay user_id, ubicación del usuario ni IP. Sólo lo que informa el proveedor.
-- * Llegadas INFERIDAS en tabla aparte con método y confianza: nunca se tratan como verdad absoluta.
-- * Retención por defecto 90 días (purge_arrival_history).
-- * Ingesta deshabilitada por defecto en la app (OBSERVATIONS_INGEST_ENABLED) hasta autorización escrita (B1).
-- * RLS activado SIN políticas públicas: sólo el service role del servidor lee/escribe.

CREATE TABLE IF NOT EXISTS public.arrival_observations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observed_at timestamptz NOT NULL,
  stop_id text NOT NULL CHECK (char_length(stop_id) BETWEEN 1 AND 40),
  line_code text NOT NULL CHECK (char_length(line_code) BETWEEN 1 AND 40),
  raw_line_code text CHECK (raw_line_code IS NULL OR char_length(raw_line_code) <= 40),
  destination text CHECK (destination IS NULL OR char_length(destination) <= 80),
  vehicle_id text CHECK (vehicle_id IS NULL OR char_length(vehicle_id) <= 40),
  eta_minutes smallint CHECK (eta_minutes IS NULL OR eta_minutes BETWEEN 0 AND 600),
  eta_status text NOT NULL CHECK (eta_status IN ('arriving', 'minutes', 'unknown')),
  raw_eta text CHECK (raw_eta IS NULL OR char_length(raw_eta) <= 40),
  deviation_minutes smallint CHECK (deviation_minutes IS NULL OR deviation_minutes BETWEEN -600 AND 600),
  gps_at timestamptz,
  -- De dónde salió la observación: consulta real de un usuario (no se hacen consultas extra para esto).
  origin text NOT NULL CHECK (origin IN ('user_query', 'widget', 'alert_runner')),
  app_version text CHECK (app_version IS NULL OR char_length(app_version) <= 20),
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arrival_observations_series_idx
  ON public.arrival_observations (stop_id, line_code, observed_at);
CREATE INDEX IF NOT EXISTS arrival_observations_vehicle_idx
  ON public.arrival_observations (line_code, vehicle_id, observed_at)
  WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS arrival_observations_inserted_idx
  ON public.arrival_observations (inserted_at);

CREATE TABLE IF NOT EXISTS public.inferred_arrivals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_id text NOT NULL,
  line_code text NOT NULL,
  -- Sólo se infieren llegadas de unidades identificadas (NOT NULL también hace efectivo el UNIQUE).
  vehicle_id text NOT NULL,
  arrived_at timestamptz NOT NULL,
  -- Cómo se infirió (ver features/observations/lib/inferArrivals.ts).
  method text NOT NULL CHECK (method IN ('arriving_status', 'eta_countdown_then_gone', 'eta_countdown_only')),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  -- Último ETA oficial visto antes de la llegada y cuándo: base para medir el error de predicción.
  last_official_eta_minutes smallint,
  last_official_eta_at timestamptz,
  algorithm_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stop_id, line_code, vehicle_id, arrived_at)
);

CREATE INDEX IF NOT EXISTS inferred_arrivals_series_idx
  ON public.inferred_arrivals (stop_id, line_code, arrived_at);

ALTER TABLE public.arrival_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inferred_arrivals ENABLE ROW LEVEL SECURITY;
-- Sin políticas: anon/authenticated no tienen acceso. El service role ignora RLS.

-- Retención configurable. Programar con pg_cron si está disponible, p. ej.:
--   SELECT cron.schedule('purge-arrival-history', '17 4 * * *', $$SELECT public.purge_arrival_history(90)$$);
CREATE OR REPLACE FUNCTION public.purge_arrival_history(retention_days integer DEFAULT 90)
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
  DELETE FROM public.inferred_arrivals WHERE arrived_at < now() - make_interval(days => retention_days * 4);
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_arrival_history(integer) FROM PUBLIC, anon, authenticated;
