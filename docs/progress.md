# Progreso

Estados: TODO · IN_PROGRESS · BLOCKED · DONE (DONE = criterios cumplidos con evidencia en `docs/testing-results.md`).

| Tarea | Estado | Evidencia / nota |
| ----- | ------ | ---------------- |
| T0.1 Auditoría, licencia | DONE | `docs/architecture/current-state.md` |
| T0.2 Línea base de pruebas | DONE | `docs/testing-results.md` |
| T0.3 Matriz y plan | DONE | `docs/feature-matrix.md`, `docs/implementation-plan.md` |
| T1.1 Normalización de arribos | DONE | `features/arrivals/lib/normalize.ts` · 27 tests |
| T1.2 Vectores compartidos | DONE (TS) / IN_PROGRESS (Kotlin, Swift) | `shared/contracts/arrival-vectors.json`; tests nativos escritos, sin ejecutar |
| T1.3 Frescura | DONE | `freshness.ts` · 7 tests |
| T1.4 Capacitor 8.5.3 | IN_PROGRESS | `cap add/sync` OK; build Android/iOS pendiente de CI (B2) |
| T1.5 CI | IN_PROGRESS | `.github/workflows/ci.yml`; no ejecutado (requiere push autorizado) |
| T2.1 WidgetConfig v1 | DONE | `features/widgets/lib/config.ts` |
| T2.2 Multilínea | DONE | `rows.ts`, no mezcla paradas físicas |
| T2.3 Widget inteligente | DONE | franjas, cruce de medianoche, TZ AR |
| T2.4 Plugin BondiWidget | IN_PROGRESS | TS DONE (3 tests); Kotlin/Swift escritos sin compilar |
| T2.5 Widget Android (Glance + WorkManager) | IN_PROGRESS | código + tests JVM escritos; sin compilar |
| T2.6 Widget iOS (WidgetKit + App Intents) | IN_PROGRESS | código + `add_widget_target.rb`; sin compilar |
| T2.7 Pantalla `/widgets` | DONE | verificada en navegador; e2e automatizado pendiente (T2.7b) |
| T2.4b Snapshots compartidos app→widget | DONE (TS) | `shareArrivals.ts`, hook en `useArribos`; no comparte STALE ni fixtures |
| T3.1 Motor de alertas | DONE | `features/alerts/lib/engine.ts` · 11 tests |
| T3.2 Ejecutor local + `/alertas` | DONE (web) | `runner.ts` (5 tests), `AlertRunner` en layout, `/alertas`; notificación real sin verificar en dispositivo |
| T3.3 Push servidor | BLOCKED | B3 |
| T4.x Históricos | TODO / BLOCKED prod | B1; esquema compatible con Fase 9 (D10) |
| T5.x ML | TODO | |
| T6.1 Cuándo salir | DONE | lógica + UI en el panel de arribos (`DepartureAdvisor`); ubicación sólo a pedido, no se guarda |
| T6.2–T6.4 | TODO | |
| T7.x | TODO / BLOCKED (B5) | |
| Fase 9 Offline-first | TODO | Dependencias arquitectónicas fijadas (D10) |
