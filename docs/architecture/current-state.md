# Estado actual — auditoría (Fase 0)

Fecha de auditoría: 2026-11-11. Base: `main` @ `467083f`.

## Licencia

MIT, © 2026 Celiz & Contributors (`LICENSE`). Todo trabajo derivado conserva ese aviso.
Los assets de terceros (`public/press-logos`, `public/sponsors`, tipografías en `public/fonts`)
pueden tener licencias propias: no se redistribuyen en builds nativos sin revisarlas (ver `docs/blockers.md`).

## Stack real (versiones de `package.json`)

| Pieza | Versión | Notas |
| ----- | ------- | ----- |
| Next.js (App Router, Cache Components) | 16.3.1 | `output: "standalone"` fuera de Vercel. Deploy actual: Render (workflow `render-deploy.yml`). |
| React / React DOM | 19.2.8 | React Compiler (`babel-plugin-react-compiler`). |
| TypeScript | ^5, `strict: true` | `tsc --noEmit` pasa limpio. |
| Tailwind CSS | 4 | Tokens en `app/globals.css`, guía en `DESIGN.md`. |
| Estado cliente | zustand 5 + `persist` (LocalStorage) | Favoritos (`cuandollega_favoritos`), historial, flujo de búsqueda. |
| Datos | SWR 2 | `useArribos`: polling 25 s, sin refresco en background, backoff por tipo de error. |
| Mapas | Leaflet 1.9 / react-leaflet 5 | |
| Validación | zod 3 | |
| Opcionales | Supabase, MercadoPago (anuncios), AdSense, GA, Clarity, Vercel Analytics | |
| Tests | vitest 4 | 18 archivos, 151 tests. |
| Gestor | bun 1.2 (`bun.lock`) | En esta auditoría se usó npm (bun no instalado); `package-lock.json` excluido localmente. |

## Estructura

Screaming Architecture (`docs/architecture.md`): `app/` (rutas y route handlers finos), `features/<dominio>/`,
`shared/` (cliente API, UI, mapa), `lib/server/` (dump estático, grafo del planner).

`server/src/index.ts` es un backend Hono **incompleto en este repo**: importa `routes/*`, `env.js` y
`lib/mgpDirect.js` que no están versionados acá (rutas `favoritos`, `rutinas`, `subscribe`, `telegram`).
Está excluido del `tsconfig`. Se trata como código de referencia, no ejecutable.

## Datos

### Catálogo (estático)
`data/static/` (generado de `data/mgp-static-dump.json`), servido por `GET /api/reference` con
`s-maxage=86400`. Además hay GTFS en `public/gtfs` y `public/gtfs.zip`, y líneas manuales GeoJSON.

### Arribos en vivo
`shared/api/client.ts` → `GET {base}/mgp/{accion}`, con bases = mismo origen (`/api/mgp`),
`NEXT_PUBLIC_CUANDO_API_URL` y `NEXT_PUBLIC_PROXY_API_URL`, orden aleatorio con failover ante red/5xx,
timeout 12 s, metadatos `X-Cache` (`HIT|MISS|STALE`).

**Decisión del responsable del proyecto (2026-11-11): la conexión de datos se mantiene tal cual.**
Ninguna fase de este plan modifica `shared/api/client.ts`, `app/api/mgp/*`, `lib/server/mgpDirect.ts`
ni el workflow `probe-v670.yml`. El trabajo nuevo consume arribos sólo a través del cliente existente
(web) o del mismo endpoint HTTP público de la app (widgets nativos).

Formato observado del campo `Arribo`: `"Arribando.."`, `"N min. aprox."`. `DesvioHorario` como `±HH:MM`.
`UltimaFechaHoraGPS` con timestamp de la última posición. No hay identificador de "viaje" estable;
`IdentificadorCoche` puede venir en `"0"`.

## Caché

| Capa | Mecanismo |
| ---- | --------- |
| Catálogo | CDN `s-maxage=86400` + Data Cache Next (`revalidate: 86400`) |
| Arribos | CDN/proxy con TTL corto (`X-Cache`); SWR en memoria del cliente |
| Planner | LRU en `app/api/geo/plan` |
| Calles | LocalStorage TTL 24 h |
| PWA | `public/sw.js` |

## Errores, carga y conectividad

`shared/api/errors.ts` clasifica `MgpNetworkError`, `MgpUnavailableError`, `MgpBusinessError` y define
backoff (`nextRetryDelayMs`). UI: `ArrivalsLoading`, `ArrivalsEmpty`, `ErrorBanner`, aviso de servicio caído,
`isStale` cuando el proxy sirve STALE. No hay manejo explícito de "offline" del dispositivo más allá del error de red.

## Funcionalidades existentes (resumen; detalle en `docs/feature-matrix.md`)

Consulta por línea → calle → intersección → parada; arribos con desvío, adaptado, posición GPS; favoritos
con nombre; historial; paradas cercanas (haversine); mapa en vivo; recorridos por línea; planificador
«Cómo llego» (RAPTOR por rondas, ≤3 colectivos, transbordo a pie ≤300 m, modelo de costos en minutos);
reseñas de líneas (Supabase); compartir en vivo vía Telegram; anuncios (MercadoPago, AdSense); blog/SEO;
borrado de cuenta (`/api/account/delete`); páginas de privacidad y términos.

## Pruebas y CI

- Línea base (desde `E:\` en PowerShell): **17/18 archivos, 141/151 tests pasan**.
- Los 10 fallos están en `shared/api/client.test.ts` (failover): el commit `77e525b` agregó el mismo origen
  como primera base y los tests no se actualizaron. Preexistente; no se toca (código de conexión).
- Advertencia de entorno: en Windows, correr vitest con la unidad en minúscula (`/e/...` en Git Bash)
  carga el runner dos veces y **todos** los archivos fallan con `Cannot read properties of undefined (reading 'config')`.
- `eslint`: 2 errores preexistentes `react-hooks/set-state-in-effect`.
- CI: no hay workflow de lint/test/build. Sólo `render-deploy.yml` y `probe-v670.yml` (manual).

## Móvil

Existe app en Google Play (`com.bondimdp.app`), pero **su proyecto nativo no está en este repo**. El código
web detecta WebView (`; wv)`) para no promocionar Play dentro de la app, lo que sugiere un wrapper WebView.
No hay Capacitor, ni widgets, ni proyecto iOS.

## Riesgos y deuda técnica

| # | Riesgo | Severidad | Nota |
| - | ------ | --------- | ---- |
| R1 | Permisos de uso de datos de transporte | Alta | Ver `docs/blockers.md` (B1). Condiciona monetización y recolección histórica. |
| R2 | Sin CI de calidad | Alta | Se agrega en este plan. |
| R3 | Tests de failover rotos en `main` | Media | Reportado; requiere decisión del mantenedor. |
| R4 | `server/` incompleto en el repo | Media | Push/rutinas parecen vivir fuera del repo. |
| R5 | Fuente de verdad del proyecto Android fuera del repo | Media | Riesgo de colisión de `applicationId`. |
| R6 | Dependencia de un único proveedor de datos | Media | Roadmap ya contempla capa de proveedor (Cámara). |
| R7 | Dev fixtures mezclados en el hook de producción | Baja | Condicionados por `NODE_ENV`. |
