# Plan de implementación

Orden: funcionalidad real → pruebas → confiabilidad → UX → optimización → nuevas funcionalidades.
Cada tarea tiene criterio de aceptación (CA) verificable. Estado vivo en `docs/progress.md`.

## Entorno disponible (condiciona la verificación)

| Recurso | Disponible | Consecuencia |
| ------- | ---------- | ------------ |
| Node 24 / npm | Sí | Web, tests TS. |
| Python 3.12 | Sí | Pipeline ML. |
| JDK / Android SDK | **No** | El proyecto Android se genera y se compila en GitHub Actions; no se afirma compilación local. |
| macOS / Xcode | **No** | iOS sólo en runner `macos-*` de CI. No se afirma que se ejecutaron tests iOS. |
| Credenciales tiendas / firma | **No** | Se dejan configuraciones con secretos de CI, sin claves en el repo. |

## Fase 0 — Auditoría
- T0.1 Clonar, licencia, docs → CA: `docs/architecture/current-state.md`. 
- T0.2 Línea base de tests/lint/tsc → CA: resultados en `docs/testing-results.md`.
- T0.3 Matriz y plan → CA: `docs/feature-matrix.md`, este archivo.

## Fase 1 — Núcleo de dominio y base móvil
- T1.1 `features/arrivals/lib/normalize.ts`: `Arribo` → `NormalizedArrival` (minutos, estado, desvío, frescura del GPS). CA: tests con todos los formatos observados; formatos desconocidos → `etaMinutes: null`.
- T1.2 Vectores de prueba compartidos `shared/contracts/arrival-vectors.json` usados por TS (y luego Kotlin/Swift). CA: test TS que los recorre.
- T1.3 Frescura de datos `freshness.ts` (`fresh/aging/stale`). CA: tests de bordes.
- T1.4 Capacitor 8.5.3 (`capacitor.config.ts`, `android/`, `ios/`), modo `server.url`. CA: `npx cap sync` sin errores; build Android en CI.
- T1.5 CI `ci.yml`: lint (sin bloquear por errores preexistentes), tsc, vitest, build web. CA: workflow válido; ejecución real requiere push (autorización).

## Fase 2 — Widgets
- T2.1 Modelo `WidgetConfig v1` + validación zod (una línea, multilínea, inteligente; tamaños; preferencias). CA: tests de validación y migración de versión.
- T2.2 Selección/orden multilínea (`selectWidgetRows`): orden cronológico, sin asumir paradas compartidas (agrupa por `identificadorParada`). CA: tests.
- T2.3 Widget inteligente: elección de configuración por franja horaria/lugar. CA: tests con relojes fijos y TZ `America/Argentina/Buenos_Aires`.
- T2.4 Plugin Capacitor `BondiWidget` (TS + Kotlin + Swift): `saveConfigs`, `pushSnapshot`, `reload`. CA: tipos TS + test de la capa web con plugin mock.
- T2.5 Android Glance widget + WorkManager (15 min) + SharedPreferences. CA: compila en CI; test unitario JVM del parser con los vectores compartidos.
- T2.6 iOS WidgetKit extension + App Group. CA: compila en CI macOS.
- T2.7 Pantalla web de configuración de widgets (`/widgets`). CA: e2e de configuración (Playwright) contra dev server.

## Fase 3 — Alertas
- T3.1 Motor de reglas puro (umbral, "salir de casa", demora), recurrencia por días/franjas, deduplicación por (regla, ocurrencia, unidad), histéresis. CA: tests exhaustivos de bordes.
- T3.2 Ejecutor local (app abierta) con `@capacitor/local-notifications` / Notification API web. CA: test con adaptador mock.
- T3.3 Push servidor. **BLOCKED** hasta definir infraestructura (FCM/APNs/VAPID) — B3.

## Fase 4 — Datos e históricos
- T4.1 Esquema de observaciones (SQL migración Supabase, retención 90 días). CA: SQL revisado + test de transformación.
- T4.2 Ingesta: **sólo observaciones generadas por consultas reales de usuarios** (sin sondeo extra), muestreadas. **BLOCKED** para producción hasta B1.
- T4.3 Dashboard inicial con datos marcados (observado / inferido / estimado).

## Fase 5 — ML
- T5.1 `ml/` Python: limpieza, emparejamiento predicción↔llegada inferida (con flag de certeza), split cronológico, baseline municipal, corrección por sesgo, LightGBM. CA: pytest sobre datos sintéticos **etiquetados como tales**; reporte de métricas (MAE, RMSE, MedAE, ±2 min, cobertura de intervalos).
- T5.2 Puerta de publicación: corrección sólo si mejora MAE ≥10 % y ±2 min ≥ baseline en validación y prueba. CA: test de la puerta.
- T5.3 Endpoint de inferencia con fallback al ETA oficial. CA: test de contrato.

## Fase 6 — Movilidad inteligente
- T6.1 "Cuándo salir": caminata (haversine × factor de desvío / velocidad configurable), margen, variabilidad, histéresis anti-oscilación. CA: tests.
- T6.2 Detección de anomalías por reglas (salto de ETA, GPS congelado, headway anómalo) con niveles de evidencia. CA: tests.
- T6.3 Planificador: "salir a / llegar antes de", preferencias de línea, menos caminata/transbordos sobre el RAPTOR existente.
- T6.4 Personalización local opt-in.

## Fase 7 — IA conversacional y colaboración
- T7.1 Herramientas tipadas + `LlmProvider` intercambiable + límites. **BLOCKED** sin clave (B5); se implementa con proveedor mock.
- T7.2 Reportes colaborativos con caducidad, deduplicación, rate limit; ocupación experimental sólo desde reportes.

## Fase 9 — Motor de predicción offline-first (agregada 2026-11-11, §24)
Se implementa después de las fases anteriores. Dependencias arquitectónicas resueltas **antes** (ver D10):
- T9.0 (Fase 4, ya comprometido) Observaciones crudas con timestamp y calendario versionado aparte. CA: el esquema permite reconstruir llegadas inferidas, headways y distribuciones sin columnas derivadas del futuro.
- T9.0b Contrato de widgets v2 con `source: live | historical | scheduled | none` y estados `OFFLINE_MODEL` / `OFFLINE_INSUFFICIENT`. CA: v1 sigue leyéndose (los widgets aceptan ambas versiones). **Resuelto distinto (D17):** el contrato v1 no cambió; la estimación viaja en una tabla aparte `offline_v1` y el estado de fila `OFFLINE_ESTIMATE` sólo aparece si no hay dato en vivo usable.
- T9.1 Perfiles estadísticos: por (parada, línea, sentido, tipo de día, franja de 15 min) → cuantiles de headway y de tiempo a la próxima llegada; tipo de día desde calendario (feriados nacionales/provinciales/municipales, vacaciones escolares, temporada turística). CA: pipeline reproducible, split cronológico, baseline de horarios/frecuencias.
- T9.2 Artefacto compacto `profiles-v1` (JSON comprimido o SQLite) con versión de esquema, `generatedAt`, rango de datos y SHA-256; descarga priorizada por favoritos/widgets; se conserva la versión anterior ante fallos de validación. CA: tests de integridad y rollback.
- T9.3 Inferencia local en TS/Kotlin/Swift sin red, con intervalos; estados ONLINE / OFFLINE CON MODELO / OFFLINE SIN DATOS. Nunca inventa minutos. CA: vectores compartidos como en §widgets.
- T9.4 Validación simulando desconexiones de 1, 6, 12, 24 y 72 h: MAE, cobertura de intervalos, degradación temporal, tamaño, tiempo de inferencia. CA: reporte en `docs/testing-results.md`.
- T9.5 ML (LightGBM → artefacto exportable) **sólo** si supera el baseline estadístico con los criterios de T5.2. ONNX/Core ML/LiteRT únicamente con beneficio medido.
- Recolección: arranca cuando exista la infraestructura (T4.x) **y** la autorización documentada (B1).

## Fase 8 — Producción
Seguridad, documentación de privacidad (Apple/Google), costos 100/1k/10k usuarios, preparación de tiendas, freemium preparado sin cobros.
