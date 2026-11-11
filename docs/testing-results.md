# Resultados de pruebas

Entorno: Windows 11, Node 24.15, npm 11.17, sin JDK/Android SDK, sin macOS.

> **Cómo correr vitest en Windows:** desde PowerShell en `E:\...` (unidad en mayúscula). Desde Git Bash (`/e/...`)
> vitest carga el runner dos veces y **todos** los archivos fallan con
> `Cannot read properties of undefined (reading 'config')`. No es un bug del código.

## 2026-11-11 — Línea base (antes de cambios)

| Chequeo | Resultado |
| ------- | --------- |
| `vitest run` | 17/18 archivos, **141/151** tests. 10 fallos en `shared/api/client.test.ts` (failover; preexistente, B7). |
| `tsc --noEmit` | OK |
| `eslint .` | 2 errores preexistentes `react-hooks/set-state-in-effect` |

## 2026-11-11 — Ciclo 1

| Chequeo | Resultado | Evidencia |
| ------- | --------- | --------- |
| `vitest run` (completo) | 24/25 archivos, **224/234**. Los 10 fallos son los mismos preexistentes. | +83 tests nuevos, 0 regresiones |
| Tests nuevos | normalize 27 · freshness 7 · argentina 6 · widgets 16 · bridge 3 · advisor 13 · alerts 11 | `features/**/lib/*.test.ts`, `shared/time` |
| `tsc --noEmit` | OK | |
| `eslint` sobre módulos nuevos | OK (0 problemas) | `eslint .` sigue con los 2 errores preexistentes |
| `npx cap add android/ios`, `npx cap sync` | OK | |
| Android `testDebugUnitTest` / `assembleDebug` | **NO EJECUTADO** (sin JDK/SDK local). Definido en `.github/workflows/ci.yml` job `android`. | Pendiente de ejecución en CI (B2) |
| iOS `swift test` BondiWidgetCore | **NO EJECUTADO** (sin toolchain Swift local). Job `ios-core`. | Pendiente (B2) |
| iOS `xcodebuild` | **NO EJECUTADO**. Job `ios-build` compila para simulador sin firma; no ejecuta tests de UI. | Pendiente (B2) |
| E2E Playwright | No implementado todavía (pantalla `/widgets` pendiente, T2.7). | |

Advertencia: el código Kotlin y Swift **no fue compilado** en este ciclo. Hasta que CI corra, su estado es
"escrito y revisado", no "verificado".

## 2026-11-11 — Ciclo 2 (pantalla /widgets + snapshots compartidos)

| Chequeo | Resultado |
| ------- | --------- |
| `vitest run` (completo) | 27/28 archivos, **237/247**. Los 10 fallos siguen siendo los preexistentes (B7). +13 tests nuevos: draft 8, store 2, shareArrivals 3. |
| `tsc --noEmit` / eslint (features, app/(main)) | OK / OK |
| Verificación manual en navegador (Playwright MCP, `next dev`) | `/widgets` carga sin errores de consola propios; validación muestra «Poné un nombre al widget.»; se creó un widget multilínea con 2 favoritos; `bondi:widget-configs` guarda contrato v1 válido; persiste tras recargar; layout correcto a 390 px. |
| Bug encontrado y corregido en la verificación | `registerPlugin("BondiWidget")` se llamaba en cada render → «already registered». Ahora se registra una sola vez por módulo. |
| E2E automatizado (Playwright test runner) | **Pendiente**: la verificación de este ciclo fue manual. Requiere agregar `@playwright/test` (decisión de dependencia) — T2.7b. |

Nota de entorno: sin `NEXT_PUBLIC_SUPABASE_URL`, todo el layout `(main)` falla al cargar (`supabaseUrl is required`,
preexistente en `shared/infra/supabase.ts`). Para desarrollo local se usó una URL de marcador `http://127.0.0.1:54321` (B9).

## 2026-11-11 — Ciclo 3 (ejecutor de alertas + /alertas + «¿Cuándo salgo?»)

| Chequeo | Resultado |
| ------- | --------- |
| `vitest run` (completo) | 30/31 archivos, **249/259**. Mismos 10 fallos preexistentes (B7). +12 tests: runner 5, draft de alertas 3, fromArrivals 4. |
| `tsc --noEmit` | OK |
| `eslint .` | 2 errores (los mismos preexistentes); 0 en código nuevo. |
| Navegador (`/alertas`) | Pantalla carga; banner de permiso con botón explícito; se creó y guardó una regla válida (`bondi:alerts`). **0 requests a `/mgp/`** durante la prueba (regla fuera de franja activa). Datos de prueba borrados al final. |
| Bug encontrado y corregido | Clics rápidos en los días se pisaban (cada clic usaba el estado del render anterior). Editores de alertas y widgets pasaron a actualizaciones funcionales; re-verificado en navegador. |
| «¿Cuándo salgo?» | Verificado con tests unitarios. **No** se probó en navegador: requiere arribos reales y no se generó tráfico al proveedor durante las pruebas. |
| Notificaciones reales | No verificadas: requieren conceder permiso en un dispositivo/navegador y arribos reales en franja. |

## 2026-11-11 — Destrabe de compilación nativa

| Chequeo | Resultado |
| ------- | --------- |
| Toolchain local | Temurin JDK 21.0.13 (winget) + Android SDK (cmdline-tools, platform 36, build-tools 36.0.0) en `C:\Android\sdk`. |
| Android `testDebugUnitTest` (local) | **13/13 OK** (ArrivalParserTest 4, WidgetRowsTest 9) — vectores compartidos con TS pasan en Kotlin. Hizo falta 1 corrección (import de `actionStartActivity`). |
| Android `assembleDebug` (local) | **OK** — `app-debug.apk` 7,2 MB. No se instaló en emulador/dispositivo todavía. |
| Fork | `rodrigofanjul/cuando-llega-mi-bondi` (público, fork del original). Push al repo de la organización deshabilitado en el remoto `upstream`. |
| CI run 43032100679 | `ios-core` (**swift test**) **OK**. Fallos: lint y suite completa (preexistentes, esperados), Android (gradlew sin +x), iOS build (`BondiWidget.swift`). Corregidos en el commit siguiente. |

## 2026-11-11 — Ciclo 4 (históricos)

| Chequeo | Resultado |
| ------- | --------- |
| `vitest run` (completo) | 34/35 archivos, **268/278**. Mismos 10 fallos preexistentes (B7). +19 tests: observaciones/inferencia 10, rate limit 3, endpoint 4, reporter 2. |
| Migración SQL contra Postgres real (PGlite 0.3.7, fuera del repo) | **12/12 chequeos OK**: inserts válidos, rechazo por constraints (origin, ETA, vacío), unicidad de llegadas, retención mínima, purga, RLS activado, sin políticas públicas. |
| Ingesta | Apagada por defecto en cliente y servidor; verificado por test que no guarda sin el flag. |
| `tsc` / `eslint .` | OK / 2 errores preexistentes (se agregaron `android/`, `ios/`, `mobile/` a los ignores para no lintear artefactos de build). |

## 2026-11-11 — CI en el fork (run 43034928151, commit 957fb17)

| Job | Resultado |
| --- | --------- |
| iOS · BondiWidgetCore (`swift test`, macOS 15) | **OK** — vectores compartidos y lógica de widgets en Swift. |
| iOS · build simulador sin firma (Xcode 16.4) | **OK** — app + extensión WidgetKit compilan. No se ejecutó en simulador ni dispositivo. |
| Android · unit tests + APK debug | **OK** — 13 tests JVM + `assembleDebug`. |
| Web · typecheck / tests nuevos / build | **OK** (build con variables de marcador de Supabase, B9). |
| Web · suite completa | Falla sólo por los 10 tests preexistentes de `shared/api/client.test.ts` (B7): 34/35 archivos. |
| Web · lint | Falla sólo por los 2 errores preexistentes. |

Correcciones que hicieron falta para llegar acá: import de Glance (Kotlin), bit +x de `gradlew`, ternario con tipos
distintos y sombra de `accessibilityLabel` (Swift).

## 2026-11-11 — Android en emulador (API 36, x86_64, WHPX) con upstream MOCK

Sin tráfico a la Municipalidad: `/api/mgp` → `MGP_UPSTREAM` = mock local (verificado en el log del mock).

| Paso | Resultado |
| ---- | --------- |
| App nativa arranca y carga la web en la WebView | OK (`Capacitor.isNativePlatform() === true`, plugin `BondiWidget` disponible). |
| `/widgets` dentro de la app → plugin → `SharedPreferences` | OK: `store_v1` con contrato v1 y `apiBase` del mismo endpoint de la web. |
| Widget en el launcher | Aparece como «Bondi MDP · Próximo bondi» con descripción; se agrega y muestra estado inicial «Sin datos / Esperando primera actualización». |
| Actualización con WorkManager | OK: el mock recibe `P11003/531` y `P2/573`; el widget muestra «531 · Luro y Salta · 1 min · Actualizado 11:23». |
| **Bug encontrado y corregido** | El widget no se redibujaba tras actualizar (datos leídos antes de `provideContent`). Ahora usa estado de Glance versionado (`refreshAll`). |
| Sin conexión (túnel cortado, ↻) | OK: conserva el último dato, descuenta minutos localmente y muestra «11:23 · Sin conexión». |
| Límite de consumo | OK: dentro de 90 s del último dato, ↻ no vuelve a consultar. |
| Lector de pantalla | OK tras corrección: «Línea 531, cualquier sentido, parada Luro y Salta, llega en 1 minuto, el siguiente en 6 minutos» (antes decía «1 minutos»; «0 min» ahora es «< 1 min»). |
| No probado | Configuración por instancia (pantalla de elección con varias configs), tamaños grandes, Doze/WorkManager diferido, dispositivo físico. |

## 2026-11-11 — Ciclo 5 (detección de demoras y anomalías)

| Chequeo | Resultado |
| ------- | --------- |
| `vitest run` (completo) | 35/36 archivos, **278/288**. Mismos 10 fallos preexistentes (B7). +10 tests de `features/anomalies`. |
| `tsc` / `eslint .` | OK / 2 errores preexistentes. |
| CI run 43038892780 | iOS (`swift test` + `xcodebuild`) y Android OK con los cambios de textos del widget. |
| Navegador con upstream MOCK (`/consultar?linea=93&parada=P2303`) | Aviso «DEMORA ESTIMADA · Demora estimada de 6 min según el desvío horario informado» (unidad MOCK con desvío +06:00). |
| «¿Cuándo salgo?» con datos (pendiente desde el ciclo 3) | **Verificado**: «El colectivo llega en aproximadamente 10 min. Tardás 5 min caminando. Te recomendamos salir en 1 min.» |
| Errores de consola | Sólo de entorno: Supabase de marcador, endpoint no implementado por el mock (banderas → 502), 404 PWA preexistente. |
| Pendiente | Validar umbrales (5–6 min) con histórico real; Isolation Forest cuando haya datos (B1). |

## 2026-11-11 — Ciclo 6 (ML offline + inferencia)

| Chequeo | Resultado |
| ------- | --------- |
| `pytest` (ml/) | **11/11 OK**: calendario, rotulado sintético, limpieza/duplicados, exclusión de llegadas `low`, emparejamiento con la primera llegada posterior, split cronológico sin solapamiento, modelos > baseline con sesgo conocido, cobertura de intervalos, exportación == LightGBM (1e-9), reglas de la puerta, corrida completa nunca publica sintéticos. |
| Corrida de referencia (datos SINTÉTICOS) | Municipal MAE 1,69 / ±2 min 75,5 % · Tabla de sesgo 1,48 / 77,5 % · **LightGBM 1,39 / 76,1 %** · cobertura 90 % → 89,5 %. Puerta: **NO PUBLICABLE (datos no reales)**. |
| Paridad Python ↔ TS | **30/30 casos**: variables y predicción idénticas (tolerancia 1e-9). |
| `/api/predict` | Sin modelo → ETA oficial; sintético rechazado en producción y sin flag; artefacto ilegible → fallback; validación de parámetros. |
| `vitest` completo | 37/38 archivos, **349/359**: mismos 10 fallos preexistentes (B7); +71 tests de predicción. |
| No hecho | Entrenamiento con datos reales (B1), monitoreo de precisión en producción, XGBoost (descartado por ahora). |

## 2026-11-11 — CI run 43044881572 (ciclo 6)

`ml` pytest **OK en Linux** (incluye paridad de árboles). Falló la comparación bit a bit del fixture: LightGBM genera
umbrales levemente distintos entre Windows y Linux. Se reemplazó por `bondi_ml.check_fixture` (esquema, variables
y paridad de los casos). Web: build OK; sólo la suite preexistente (B7). Android y `swift test` OK.

## 2026-11-11 — Ciclo 7a (planificador: preferencias y horarios)

| Chequeo | Resultado |
| ------- | --------- |
| Tests | `preferences.test.ts` 11 + `argentina.test.ts` (+1); planner/costModel existentes siguen OK (33/33 en trip-planner). |
| Navegador (`/como-llego`, catálogo estático, sin servicios externos: lugares recientes sembrados) | «5 opciones de viaje», cada una con «Salí 12:09 · llegás ~12:36». «Menos caminata» sube la opción de 307 m del 5.º al 3.er lugar. «Llegar antes de las 12:30» → «Ninguna opción llega antes de las 12:30. Probá con otro horario.» «Llegar antes de las 13:00» → ordenadas por salida más tardía (12:33, 12:32, …). 0 errores de consola. |
| No hecho | Primera espera con arribo en vivo en la UI (la función existe y está testeada; no se conectó para no sumar consultas automáticas). |
