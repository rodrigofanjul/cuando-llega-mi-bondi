# Matriz de funcionalidades

Leyenda: **E** existente y reutilizable · **EM** existente, requiere mejoras · **NI** no implementada · **BX** bloqueada por dependencia externa.
Estado al 2026-11-11 (revisado contra el código, no supuesto).

| Funcionalidad (sección del prompt) | Estado | Evidencia / ubicación | Nota |
| --- | --- | --- | --- |
| Consulta de arribos | E | `features/arrivals`, `useArribos` | Polling 25 s, backoff, STALE. |
| Normalización de arribos (minutos, estado) | EM | `features/arrivals/utils.ts` | Sólo color; falta modelo normalizado reutilizable por widgets/alertas. |
| Favoritos | E | `features/favorites` (zustand persist) | Nombre libre ("Casa", "Trabajo"). Sin categorías de lugar. |
| Historial | E | `features/history` | |
| Paradas cercanas | E | `/api/geo/paradas-cercanas`, `shared/geo/haversine.ts` | |
| Mapa en vivo / recorridos | E | `shared/map`, `features/route` | |
| Planificador (§8) | EM | `features/trip-planner`, RAPTOR | Estático: no usa ETA en vivo, sin "llegar antes de", sin preferencias de línea. |
| Estado de servicio / errores | E | `shared/api/errors.ts` | |
| Offline explícito | EM | `public/sw.js` | Sin estado "sin conexión" ni caché de último arribo visible. |
| Modo claro/oscuro | E | `next-themes`, `ThemeToggle` | |
| Accesibilidad | EM | `DESIGN.md` (WCAG AA) | Auditar lectores de pantalla en flujos nuevos. |
| Reseñas de líneas | E | `features/reviews` | Base para reportes colaborativos (§13). |
| Borrado de cuenta | E | `/api/account/delete` | |
| App Android | EM / BX | Estado previo: app original `com.bondimdp.app` (no es esta app) | Proyecto nativo propio en `android/`; sin publicar (B4/B6). |
| Capacitor (§3) | NI | — | |
| App iOS | NI | — | Requiere macOS/Apple Developer para firmar. |
| Widget una línea (§4.1) | NI | — | |
| Widget multilínea (§4.2) | NI | — | |
| Widget inteligente (§4.3) | NI | — | |
| Configuración de widgets (§4.4) | NI | — | |
| Alertas (§5) | NI | `NEXT_PUBLIC_VAPID_PUBLIC` sugiere push previsto; rutas `subscribe` no versionadas | |
| Recolección histórica (§6.1) | BX | — | Requiere confirmar alcance permitido de recolección (B1). |
| Modelos ML (§6.3–6.5) | BX | — | Sin dataset real. Pipeline implementable con datos sintéticos rotulados. |
| Cuándo salir (§7) | NI | — | Implementable sobre arribos existentes. |
| Detección de anomalías (§9) | NI | — | Reglas estadísticas sobre la serie de ETA de la sesión. |
| Personalización (§10) | NI | — | Local, opt-in. |
| Asistente conversacional (§11) | NI / BX | — | Requiere API key de LLM. |
| Ocupación estimada (§12) | NI | — | Sólo reportes voluntarios; no existe dato oficial conocido. |
| Reportes colaborativos (§13) | NI | Reseñas como base | |
| Analítica histórica (§14) | NI / BX | — (la página de estadísticas se quitó, D19) | Depende de §6.1. |
| Freemium (§16) | NI | — | Sin anuncios ni cobros (D19); cobros prohibidos hasta B1/B4. |
| Motor offline-first (§24, Fase 9) | NI / BX | — | Requiere histórico autorizado (B1). Contrato y almacenamiento ya preparados (D10). |
| CI/CD (§19) | NI | Sólo deploy Render | |
| Observabilidad (§20) | EM | `X-Cache`, métricas propias anónimas (`/api/ux`, apagadas) | |
