# Progreso

Estados: TODO · IN_PROGRESS · BLOCKED · DONE (DONE = criterios cumplidos con evidencia en `docs/testing-results.md`).

| Tarea | Estado | Evidencia / nota |
| ----- | ------ | ---------------- |
| T0.1 Auditoría, licencia | DONE | `docs/architecture/current-state.md` |
| T0.2 Línea base de pruebas | DONE | `docs/testing-results.md` |
| T0.3 Matriz y plan | DONE | `docs/feature-matrix.md`, `docs/implementation-plan.md` |
| T1.1 Normalización de arribos | DONE | `features/arrivals/lib/normalize.ts` · 27 tests |
| T1.2 Vectores compartidos | DONE | TS (vitest), Kotlin (JUnit, local + CI) y Swift (XCTest en CI) ejecutan el mismo JSON |
| T1.3 Frescura | DONE | `freshness.ts` · 7 tests |
| T1.4 Capacitor 8.5.3 | DONE (build) | Android: APK debug local y en CI; iOS: compila en CI (Xcode 16.4). Falta ejecución en emulador/simulador |
| T1.5 CI | DONE | corre en el fork; rojo sólo por fallos preexistentes (B7, lint) |
| T2.1 WidgetConfig v1 | DONE | `features/widgets/lib/config.ts` |
| T2.2 Multilínea | DONE | `rows.ts`, no mezcla paradas físicas |
| T2.3 Widget inteligente | DONE | franjas, cruce de medianoche, TZ AR |
| T2.4 Plugin BondiWidget | DONE (Android) | web→plugin→SharedPreferences verificado en emulador; iOS sólo compila |
| T2.5 Widget Android (Glance + WorkManager) | DONE | verificado en emulador API 36 con mock: datos, actualización, sin conexión, accesibilidad |
| T2.6 Widget iOS (WidgetKit + App Intents) | IN_PROGRESS | compila en CI; falta probar en simulador (requiere macOS) |
| T2.7 Pantalla `/widgets` | DONE | verificada en navegador; e2e automatizado pendiente (T2.7b) |
| T2.4b Snapshots compartidos app→widget | DONE (TS) | `shareArrivals.ts`, hook en `useArribos`; no comparte STALE ni fixtures |
| T3.1 Motor de alertas | DONE | `features/alerts/lib/engine.ts` · 11 tests |
| T3.2 Ejecutor local + `/alertas` | DONE (web) | `runner.ts` (5 tests), `AlertRunner` en layout, `/alertas`; notificación real sin verificar en dispositivo |
| T3.3 Push servidor | BLOCKED | B3 |
| T4.1 Esquema de observaciones | DONE | migración validada en Postgres (PGlite); RLS sin acceso público; retención 90 días |
| T4.2 Ingesta | DONE (apagada) | `/api/observations` + reporter con muestreo; BLOCKED para activar (B1) |
| T4.2b Inferencia de llegadas | DONE | `inferArrivals.ts` con método y confianza |
| T4.3 Dashboard | TODO | sin datos reales todavía |
| T5.1 Pipeline ML (sintético) | DONE | `ml/` con pytest 11/11; LightGBM −18 % MAE vs municipal en datos SINTÉTICOS |
| T5.2 Puerta de publicación | DONE | criterios fijos; sintético nunca publicable |
| T5.3 Inferencia + fallback | DONE | `/api/predict` + evaluador TS con paridad 30/30 |
| T5.4 Entrenamiento con datos reales | BLOCKED | requiere histórico autorizado (B1) |
| T6.1 Cuándo salir | DONE | lógica + UI verificada en navegador con datos MOCK; ubicación sólo a pedido, no se guarda |
| T6.2 Detección de anomalías | DONE (reglas) | `features/anomalies` (10 tests) + aviso en arribos verificado con mock; umbrales a calibrar con histórico |
| T6.3 Planificador avanzado | DONE | preferencias (rápido, menos caminata, menos transbordos, líneas preferidas) + salir ahora/a las/llegar antes de; verificado en navegador |
| T6.4 Personalización local | DONE | opt-in, sólo en el dispositivo, sin ubicación, explicada y borrable; verificada en navegador |
| T7.2 Reportes colaborativos + ocupación | DONE (sin backend configurado) | lógica, API, migración y UI verificados; falta job de reputación y panel de moderación |
| T7.1 Asistente conversacional | DONE (simulado) / BLOCKED (Claude real, B5) | herramientas tipadas, proveedor intercambiable, fundamentación, límites; Claude implementado con SDK oficial y testeado con cliente falso |
| Fase 9 Offline-first | TODO | Dependencias arquitectónicas fijadas (D10) |
| T8.1 Seguridad | DONE (parcial) | Next 16.3.1 → 16.4.1 (RCE críticas); pendientes zod/mercadopago, CSP, tiles (docs/security-review.md) |
| T8.2 Privacidad y borrado | DONE | borrado local en Perfil; inventario de datos; borradores Apple/Google; PrivacyInfo iOS; permisos de ubicación |
| T8.3 Costos | DONE (estimación) | docs/costs.md con supuestos; medir con /api/metrics |
| T8.4 Freemium preparado | DONE | entitlements apagados, existentes siempre gratis, PurchaseProvider no-op |
| T8.5 Observabilidad | DONE (básica) | métricas por ruta, tokens del asistente, logs JSON sin datos personales, /api/metrics con token |
| T8.6 Preparación de tiendas | DOCUMENTADO | docs/store-readiness.md; publicar requiere autorización |
| T9.1 Perfiles estadísticos | DONE (sintético) | ml/bondi_ml/profiles.py; evaluación vs frecuencia; 17 pytest |
| T9.2 Artefacto + sincronización | DONE | checksum, versión anterior, subconjunto por favoritos/widgets, /api/offline/profiles |
| T9.3 Inferencia local (web) | DONE | features/offline con paridad 18/18; estados §24 verificados en navegador sin red |
| T9.3b Inferencia local en widgets (Kotlin/Swift) | DONE (Android) | tabla `offline_v1` (D17) + vectores `shared/contracts/offline-vectors.json` en TS/Kotlin/Swift; widget Android verificado en emulador sin conexión; iOS: `swift test` + compilación en CI, sin simulador |
| T9.4 Validación de desconexiones | DONE (sintético) | 1/6/12/24/72 h |
| T9.5 ML offline | TODO | sólo si supera la estadística con datos reales |
| Marca configurable (D19) | DONE | `shared/brand.ts`, `scripts/apply-brand.mjs`, test `shared/brand.test.ts`; sin textos de la marca anterior visibles |
| Limpieza de terceros (D19) | DONE | sin AdSense, anunciantes/MercadoPago, GA, Clarity ni Vercel Analytics; B11 resuelto; `docs/privacy/` actualizado |
| Inicio simple (D19) | DONE | buscar → parada → Guardar → aparece en «Tus paradas» con minutos, verificado en navegador (mock) |
| Búsqueda local (D19) | DONE | `/api/search-index` 200 (~494 KB), `quickSearch`; «511 acha» devuelve paradas |
| Navegación 3 pestañas (D19) | DONE | Inicio, Viajes, Más; `/viajes` y `/mas` responden 200 |
| Detalle con barra de acciones (D19) | DONE | minutos primero; Guardar y Avisarme de un toque; la regla aparece en `/alertas` |
| Alto contraste (D19) | DONE | Perfil → `<html data-contrast="high">`, persiste al recargar |
| Métricas de experiencia propias (D19) | DONE (apagadas) | `/api/ux`, apagado por defecto; ver `docs/privacy/data-inventory.md` |