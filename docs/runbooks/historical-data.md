# Runbook: activar históricos de arribos en producción

Para quien opera Supabase y el hosting. Base: autorización escrita confirmada (B1), recolección **sólo pasiva**,
retención cruda de **1 año** (docs/decisions.md D18). Cada paso en producción requiere tu aprobación explícita.
Probado de punta a punta en local con Docker (docs/testing-results.md, ciclo 13).

## 0. Antes de empezar

- Verificar el volumen esperado y el plan de Supabase (docs/costs.md). Con 1 año de retención, medir las primeras
  semanas y decidir particionado o agregación antes de llegar a decenas de millones de filas.
- Las migraciones antiguas de `bus_locations` dependen de una tabla que no está en el repo (B13): aplicar **sólo** las
  migraciones de abajo si el proyecto ya tiene el resto.

## 1. Migraciones (Supabase SQL editor o `supabase db push`)

1. `supabase/migrations/20261111120000_arrival_observations.sql`: tablas, índices, RLS sin políticas, función de purga.
2. `supabase/migrations/20261111180000_arrival_history_retention_1y.sql`: purga con 365 días por defecto y programación
   diaria si `pg_cron` está habilitado.

Verificación:

```sql
select relname, relrowsecurity from pg_class where relname in ('arrival_observations', 'inferred_arrivals'); -- t, t
select count(*) from pg_policies where tablename in ('arrival_observations', 'inferred_arrivals');         -- 0
select pg_get_function_arguments('public.purge_arrival_history'::regproc);                                 -- DEFAULT 365
select jobname, schedule from cron.job where jobname = 'purge-arrival-history';                            -- si hay pg_cron
```

Si `pg_cron` no está habilitado: habilitarlo en el panel y volver a correr la segunda migración, o programar
`select public.purge_arrival_history(365)` una vez por día desde otro scheduler.

## 2. Variables del servidor

| Variable | Valor |
| -------- | ----- |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Del proyecto (la clave de servicio nunca va al cliente ni al repo). |
| `OBSERVATIONS_INGEST_ENABLED` | `true` |
| `NEXT_PUBLIC_OBSERVATIONS_ENABLED` | `true` (variable de build: requiere un nuevo deploy) |
| `CRON_SECRET` | Valor aleatorio largo (p. ej. `openssl rand -hex 32`). |

## 3. Scheduler de inferencia (cada 30 min)

`GET /api/cron/infer-arrivals` con `Authorization: Bearer $CRON_SECRET`. En Vercel, `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/infer-arrivals", "schedule": "*/30 * * * *" }] }
```

(Vercel envía `CRON_SECRET` como Bearer automáticamente.) La ruta sólo lee lo guardado: no consulta a la Municipalidad.

## 4. Verificación después del deploy

1. Consultar una parada en la app y esperar 1–2 min: `select count(*) from arrival_observations where observed_at > now() - interval '5 minutes';` > 0.
2. Pasados ~45 min: `curl -H "Authorization: Bearer …" https://<dominio>/api/cron/infer-arrivals` → `{"inferred": N, …}`.
3. `/api/metrics` (con `METRICS_TOKEN`): sin aumento de errores en `/api/observations POST`.

## 5. Perfiles offline con datos reales

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/export-arrival-history.mjs --out ml/data/real --days 365
cd ml && .venv/bin/python -m bondi_ml.offline_eval --arrivals data/real/arrivals.csv --out artifacts/runs/offline-real --version <fecha>
```

Publicar `artifacts/runs/offline-real/profiles.json` en el servidor y apuntar `OFFLINE_PROFILES_PATH` a ese archivo
(sin `OFFLINE_ALLOW_SYNTHETIC`). Revisar antes `offline-report.json`: con menos de 4 días no hay evaluación, y los
pares sin soporte mínimo quedan fuera (la app dice «datos insuficientes»). `ml/data/` no se versiona.

## Apagar

Poner `OBSERVATIONS_INGEST_ENABLED=false` (efecto inmediato en el servidor) y quitar el cron. Los datos se borran solos
según la retención, o a mano con `select public.purge_arrival_history(7);`.
