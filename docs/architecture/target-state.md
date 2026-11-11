# Arquitectura objetivo

Principio: **la arquitectura más simple que cumpla**. Monolito modular sobre la app Next.js existente;
nada de microservicios, Redis ni bases nuevas hasta que una métrica lo justifique.

## Vista general

```text
            ┌──────────────────── Next.js (monolito modular, existente) ───────────────────┐
 Web/PWA ──►│ app/ (rutas)  →  features/<dominio>/  →  shared/  →  lib/server/            │
            │   nuevos dominios puros (sin I/O):                                          │
            │   arrivals/lib/normalize · widgets/ · alerts/ · departure/ · anomalies/     │
            └───────────────▲───────────────────────────────▲───────────────────────────┘
                            │ WebView (server.url)          │ GET mismo endpoint de arribos
                  ┌─────────┴─────────┐           ┌─────────┴──────────────────────────┐
                  │ Capacitor shell   │  bridge   │ Widgets nativos                    │
                  │ android/ ios/     ├──────────►│ Android: Glance + WorkManager      │
                  │ plugin BondiWidget│  config + │ iOS: WidgetKit + App Group         │
                  └───────────────────┘  snapshot └────────────────────────────────────┘
```

## Decisiones (detalle y alternativas en `docs/decisions.md`)

| Área | Elección | Por qué |
| ---- | -------- | ------- |
| Backend | Seguir con route handlers de Next | Ya existe, ya despliega; agregar Hono/Express duplica auth/CORS/deploy. |
| Conexión de datos | **Sin cambios** | Decisión del responsable. Lo nuevo la consume, no la reemplaza. |
| Lógica de dominio nueva | TS puro, sin React ni I/O, en `features/<dominio>/lib` | Testeable con vitest; reutilizable en web, server y como especificación de los widgets. |
| Móvil | Capacitor 8.5.3 en modo `server.url` (sitio desplegado) | Conserva SSR y `/api/*`; un `next export` rompería route handlers y Cache Components. |
| Widgets | Nativos (Kotlin Glance / SwiftUI WidgetKit), datos vía (a) snapshot empujado por la app y (b) refresco propio | Los widgets no pueden ejecutar el JS de la WebView. |
| Contrato web↔nativo | JSON versionado (`WidgetConfig v1`, `ArrivalSnapshot v1`) + vectores de prueba compartidos | Evita que el parser TS, Kotlin y Swift diverjan. |
| Persistencia histórica | Supabase/Postgres existente cuando se habilite §6.1 | Ya está en el stack; sin TimescaleDB hasta medir volumen. |
| Caché compartida | CDN/proxy existente (`X-Cache`) | Widgets agrupan consultas por (parada, línea) y respetan intervalos mínimos. |
| ML | Python offline (`ml/`), LightGBM vs. baseline municipal, artefacto versionado; inferencia en TS sólo si supera la línea base | Fallback automático al ETA oficial. |
| Alertas | Motor puro TS (reglas + deduplicación + histéresis); ejecución local mientras la app está activa; push servidor como fase posterior | Tareas periódicas del teléfono no garantizan exactitud (§5). |
| LLM | Interfaz `LlmProvider` intercambiable + herramientas tipadas; deshabilitado sin clave | Nunca calcula rutas ni arribos (§11). |

## Restricciones de actualización de widgets (reales)

| Plataforma | Límite | Diseño |
| ---------- | ------ | ------ |
| Android | `WorkManager` periódico ≥ 15 min; Doze lo difiere | Worker cada 15 min con red, más actualización inmediata al abrir la app / al cambiar config. |
| iOS | Presupuesto de recargas del sistema (~40–70/día, no garantizado) | Timeline con entradas que recalculan "hace X min" localmente; `reloadAllTimelines()` al abrir la app. |
| Ambas | Sin garantía de frescura | Timestamp visible siempre; estados `fresh` (<2 min), `aging` (<10 min), `stale` (≥10 min) y `offline`. Un arribo vencido nunca se muestra como si fuera actual. |

Live Activities (iOS) aportan valor para **seguimiento activo de un viaje** (actualizaciones por push,
no por presupuesto de widget); quedan para la fase de alertas con push servidor.

## Compatibilidad con el motor offline (Fase 9)

| Pieza | Requisito que impone la Fase 9 | Cómo queda preparada |
| ----- | ------------------------------ | -------------------- |
| Observaciones (Fase 4) | Reconstruir llegadas y headways sin fuga de futuro | Filas crudas `(observedAt, stopId, lineCode, destination, vehicleId, etaMinutes, gpsAt, origin)`; nada derivado se guarda en la fila. Llegadas inferidas en tabla aparte con `confidence`. |
| Calendario | Feriados, vacaciones, temporada | Archivo versionado `calendar-vN.json` independiente; se une en entrenamiento por fecha local AR. |
| Contrato widgets | No confundir histórico con vivo | v2 agrega `source` y estados offline; v1 sigue soportado. `freshness` ya impide mostrar vencidos como actuales. |
| Almacenamiento compartido | Widgets leen perfiles sin la app | Mismo SharedPreferences/App Group que hoy, clave `profiles_v1` + `profiles_v1_prev` (rollback). |
| Inferencia | Sin red | Lógica pura replicada (TS/Kotlin/Swift) con vectores compartidos, igual que el normalizador. |

## Seguridad y privacidad

Sin secretos en el repo; ubicación sólo con consentimiento y redondeada si se persiste; personalización
local y desactivable; firma de builds sólo en CI con secretos del repositorio.
