-- Reportes colaborativos (§13) y ocupación experimental (§12).
--
-- * Sin datos personales: sólo `reporter_hash` = SHA-256(deviceId aleatorio + sal del servidor). Sin IP, sin cuenta.
-- * Cada reporte caduca solo (`expires_at`); la purga borra los vencidos hace más de 30 días.
-- * Moderación: `status` pending/approved/rejected (textos con enlaces, contactos o insultos quedan pending).
-- * Reputación con señales verificables (corroboración), en tabla aparte.
-- * RLS activado SIN políticas públicas: lectura y escritura sólo vía servidor (service role).

CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('ocupacion', 'demora', 'desvio', 'parada_fuera_de_servicio', 'info_incorrecta')),
  line_code text NOT NULL CHECK (char_length(line_code) BETWEEN 1 AND 40),
  stop_id text CHECK (stop_id IS NULL OR char_length(stop_id) <= 40),
  occupancy text CHECK (occupancy IS NULL OR occupancy IN ('baja', 'media', 'alta')),
  text text CHECK (text IS NULL OR char_length(text) <= 200),
  reporter_hash text NOT NULL CHECK (char_length(reporter_hash) = 64),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  moderation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK ((type = 'ocupacion') = (occupancy IS NOT NULL)),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS community_reports_active_idx
  ON public.community_reports (line_code, expires_at DESC) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS community_reports_reporter_idx
  ON public.community_reports (reporter_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS community_reports_pending_idx
  ON public.community_reports (created_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.reporter_reputation (
  reporter_hash text PRIMARY KEY CHECK (char_length(reporter_hash) = 64),
  corroborated integer NOT NULL DEFAULT 0 CHECK (corroborated >= 0),
  total integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (corroborated <= total)
);

ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporter_reputation ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.purge_community_reports(grace_days integer DEFAULT 30)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed bigint;
BEGIN
  DELETE FROM public.community_reports WHERE expires_at < now() - make_interval(days => grace_days);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_community_reports(integer) FROM PUBLIC, anon, authenticated;
