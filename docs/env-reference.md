# Referencia de variables de entorno

Valores de ejemplo en [`.env.example`](../.env.example). En desarrollo, copiá ese archivo a `.env.local`.

## Obligatorias según funcionalidad

| Variable | Leída por la app | Descripción |
| -------- | ---------------- | ----------- |
| `NEXT_PUBLIC_CUANDO_API_URL` | Sí (`shared/api/client.ts`) | URL base del backend self-hosted. Sin ella, `post()` falla en acciones en vivo. Las peticiones van a `GET {url}/mgp/{accion}?...`. |
| `NEXT_PUBLIC_PROXY_API_URL` | Sí (`shared/api/client.ts`) | URL base de un proxy opcional. Si se define junto a `NEXT_PUBLIC_CUANDO_API_URL`, el frontend balanceará la carga entre ambas. |
| `NEXT_PUBLIC_USE_STATIC_REFERENCE` | Sí | `true` (default) sirve catálogo desde `/api/reference`. `false` fuerza todo el catálogo al backend. |

## Integraciones opcionales (esta app)

| Variable | Uso |
| -------- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente público y webhook Telegram |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Idem (`sb_publishable_…`). Reemplaza la anon key |
| `SUPABASE_URL` | URL del proyecto en el server (puede ser la misma) |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable en el server si no hay `NEXT_PUBLIC_` |
| `SUPABASE_SECRET_KEY` | Escritura admin (lugar publicitario, borrar cuenta, webhooks). Nunca `NEXT_PUBLIC_` |
| `SUPABASE_JWKS_URL` | JWKS de Auth para verificar JWTs de usuario |
| `NEXT_PUBLIC_MOCK_REVIEWS` | `true` en dev: reseñas y login fake, sin Supabase. Ignorado en producción |
| `TELEGRAM_BOT_TOKEN` | `app/api/telegram-webhook` — `sendMessage` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Enlaces `t.me/...` en UI (sin `@`) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics (`shared/analytics/`) |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Microsoft Clarity |
| `NEXT_PUBLIC_ADSENSE_SLOT_CONSULTAR` | ID del bloque de AdSense en `/consultar` (`shared/ads/AdSenseUnit.tsx`). Vacío = no se muestra |
| `NEXT_PUBLIC_ADSENSE_SLOT_ARRIVALS` | ID del bloque en el sheet de arribos (después de los minutos). Puede repetir el de `/consultar` |
| `NEXT_PUBLIC_ADSENSE_SLOT_FAVORITOS` | ID del bloque en `/favoritos` (entre lista e historial). Puede repetir el de `/consultar` |
| `NEXT_PUBLIC_ADSENSE_SLOT_RECORRIDO` | ID del bloque entre carteles y calles en `/recorrido/[linea]`. Puede ser el mismo que el de `/consultar`. Vacío = no se muestra |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app (pagos MercadoPago). HTTPS en producción |
| `MERCADOPAGO_ACCESS_TOKEN` | Checkout Pro del lugar publicitario. Usar `TEST-` en desarrollo |
| `MERCADOPAGO_WEBHOOK_SECRET` | Firma HMAC del webhook de MercadoPago |
| `AD_SLOT_FLOOR_ARS` | Precio inicial del lugar si está libre (default 1000) |
| `AD_SLOT_STEP_ARS` | Incremento mínimo para sacar al ocupante (default 1000) |

Sin Telegram ni Supabase, consultas de arribos y catálogo estático siguen funcionando si el backend y el dump están configurados.

## Scripts y datos estáticos

| Variable | Uso |
| -------- | --- |
| `DUMP_MGP_URL` | Alternativa a `NEXT_PUBLIC_CUANDO_API_URL` solo en `bun run dump-static` |
| `DUMP_DELAY_MS` | Pausa entre requests al generar el dump (default ~150 ms) |
| `STATIC_REFERENCE_DUMP_PATH` | Ruta al JSON monolítico para `split-static` o carga custom |

## Docker / despliegue

| Variable | Uso |
| -------- | --- |
| `TUNNEL_TOKEN` | Token de Cloudflare Tunnel en `docker-compose.yml` |
| `NEXT_PUBLIC_BONDI_API_URL` | Build arg en Docker; mismo propósito que `CUANDO_API_URL` en algunos entornos |
| `NEXT_PUBLIC_VAPID_PUBLIC` | Build arg para notificaciones push (futuro / PWA) |

## Presentes en `.env.example` pero no usadas por el front Next.js

Estas variables documentan el **stack completo** (proxy/oracle/crypto en el backend u otros servicios). No aparecen en el código TypeScript de este repositorio:

- `MGP_PROXY_URL`, `MGP_PROXY_TOKEN`
- `MGP_ORACLE_URL`, `MGP_ORACLE_TOKEN`
- `MGP_RSA_PUBKEY`, `MGP_SHARED_KEY`
- `OSRM_URL`

Configuralas en el servicio que las consuma (backend self-hosted), no esperes efecto solo por tenerlas en `.env.local` del front.

## Históricos de arribos (apagados por defecto)

| Variable | Dónde | Default | Uso |
| -------- | ----- | ------- | --- |
| `NEXT_PUBLIC_OBSERVATIONS_ENABLED` | Cliente (build) | sin definir = apagado | `true` envía observaciones muestreadas (1/min por parada+línea) de consultas que la app ya hizo a `/api/observations`. |
| `OBSERVATIONS_INGEST_ENABLED` | Servidor | sin definir = apagado | `true` guarda en `arrival_observations` (Supabase, service role). Si no, el endpoint valida y responde 202 sin guardar. |
| `NEXT_PUBLIC_APP_VERSION` | Cliente (build) | — | Versión que acompaña cada lote de observaciones. |
| `CRON_SECRET` | Servidor | sin definir = la ruta responde 404 | Protege `GET /api/cron/infer-arrivals` (`Authorization: Bearer …`), que convierte observaciones en llegadas inferidas. Llamarla cada 30 min desde un scheduler. |

Autorización escrita confirmada por el responsable (2026-11-11, B1): recolección **sólo pasiva**, retención cruda de
**1 año**. Para activar en producción seguir `docs/runbooks/historical-data.md` (migraciones, variables, scheduler,
verificación). Nada se activa en producción sin aprobación explícita.

## Reportes colaborativos (apagados sin configuración)

| Variable | Dónde | Uso |
| -------- | ----- | --- |
| `REPORTS_SALT` | Servidor (secreto) | Sal para `reporter_hash = SHA-256(deviceId + sal)`. Sin ella `/api/reports` responde 503 y la UI oculta la función. Rotarla desvincula la reputación previa. |
| `SUPABASE_SECRET_KEY` + `SUPABASE_URL` | Servidor | Escritura/lectura con service role (RLS sin políticas públicas). |

Requiere `supabase/migrations/20261111150000_community_reports.sql` y programar `purge_community_reports(30)`.

## Predicción (ML)

| Variable | Uso |
| -------- | --- |
| `PREDICTION_MODEL_PATH` | Artefacto de `ml/` (sólo se usa si es real y publicable). Sin ella → ETA oficial. |
| `PREDICTION_ALLOW_SYNTHETIC` | `true` sólo fuera de producción, para pruebas. |

## Asistente conversacional

| Variable | Default | Uso |
| -------- | ------- | --- |
| `ANTHROPIC_API_KEY` | sin definir | Con clave, el asistente usa Claude (SDK oficial). Sin clave, usa el proveedor simulado por reglas (sin costo). |
| `ASSISTANT_MODEL` | `claude-opus-5-5` | Modelo de Claude. |
| `ASSISTANT_PROVIDER` | — | `mock` fuerza el proveedor simulado aunque haya clave. |
| `ASSISTANT_DAILY_LIMIT` | `500` | Tope diario de consultas a Claude por instancia (control de costos). Además: 20 consultas/hora por IP. |

Configuración fija: esfuerzo `low`, `max_tokens` 2048, máximo 3 rondas de herramientas, `fallbacks: "default"`
(beta `server-side-fallback-2026-07-01`: ante un rechazo, el servidor reintenta con otro modelo).

## Capacitor (builds móviles)

| Variable | Default | Uso |
| -------- | ------- | --- |
| `CAP_SERVER_URL` | `https://bondimdp.com.ar` | Sitio que carga la WebView. En emulador Android contra `next dev`: `http://10.0.2.2:3000`. |
| `CAP_APP_ID` | `com.bondimdp.app.dev` | Identificador de la app (ver B6 antes de usar `com.bondimdp.app`). |

## Vercel

En producción, definí las `NEXT_PUBLIC_*` en el panel de Vercel. El catálogo estático viaja en el deploy (`data/static/`); el backend en vivo debe ser accesible desde el navegador del usuario (CORS en el servidor externo).

## Observabilidad y monetización

| Variable | Uso |
| -------- | --- |
| `METRICS_TOKEN` | Habilita `GET /api/metrics` (Bearer). Sin ella la ruta responde 404. |
| `NEXT_PUBLIC_MONETIZATION_ENABLED` | `true` activa planes (sin cobros: no hay proveedor de compras). Default: todo habilitado. |

## Motor offline

| Variable | Uso |
| -------- | --- |
| `OFFLINE_PROFILES_PATH` | Artefacto de perfiles (`python -m bondi_ml.offline_eval`). Sin ella, el modo offline usa sólo la frecuencia publicada. |
| `OFFLINE_ALLOW_SYNTHETIC` | `true` sólo fuera de producción, para pruebas con perfiles sintéticos. |

Frecuencias publicadas: `node scripts/build-frequency-baseline.mjs` (genera `public/offline/frequencies-v1.json` desde `public/gtfs`).
