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
| T6.4 Personalización local | TODO | |
| T7.x | TODO / BLOCKED (B5) | |
| Fase 9 Offline-first | TODO | Dependencias arquitectónicas fijadas (D10) |
