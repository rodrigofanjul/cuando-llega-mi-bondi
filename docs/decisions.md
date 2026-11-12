# Registro de decisiones técnicas (ADR breve)

## D1 — No modificar la conexión de datos (2026-11-11)
Decisión del responsable del proyecto. `shared/api/client.ts`, `app/api/mgp/*`, `lib/server/mgpDirect.ts`
y `probe-v670.yml` quedan intactos. Todo lo nuevo consume arribos por el cliente existente o por el mismo endpoint HTTP.

## D2 — Monolito modular sobre Next.js existente
Alternativas: backend Node separado (Hono en `server/`), microservicios. Rechazadas: duplican deploy, CORS y auth
sin un requisito que lo exija. Se reevalúa si la ingesta histórica (§6.1) necesita un proceso de larga duración.

## D3 — Capacitor en modo `server.url`
Alternativas: (a) `output: "export"` empaquetado — rompe route handlers, Cache Components y el planner del servidor;
(b) reescritura React Native — viola "no reescribir componentes funcionales"; (c) TWA — sin puente nativo para widgets.
Costo aceptado: la app requiere red para la UI (los widgets no: tienen caché propia). Mitigación: `errorPath` local offline.

## D4 — Lógica de dominio nueva como funciones puras
`features/<dominio>/lib/*.ts` sin React ni `fetch`. Permite tests deterministas (reloj inyectado) y usar el mismo
contrato como especificación de los widgets nativos.

## D5 — Contrato web↔nativo por JSON versionado + vectores compartidos
`shared/contracts/arrival-vectors.json` se ejecuta desde vitest y desde los tests JVM/XCTest. Un cambio de formato
de la API rompe los tres a la vez en vez de divergir silenciosamente.

## D6 — Hora local fija `America/Argentina/Buenos_Aires`
Recurrencias de alertas y widget inteligente se evalúan en esa zona, no en la del dispositivo, porque el servicio es local.

## D7 — Sin Redis/Postgres nuevos en esta etapa
La caché compartida ya existe en el proxy/CDN (`X-Cache`). Para históricos se usa Supabase (ya en el stack).

## D8 — Versiones fijadas con antigüedad mínima
Capacitor 8.5.3 (2026-10-07) en lugar de 8.6.0 (2026-10-28): se prefiere una versión con semanas de uso.

## D10 — Preparar ahora la compatibilidad con el motor offline (Fase 9)
Fase 9 se implementa al final, pero tres decisiones se fijan ya porque cambiarlas después rompería el contrato
en tres plataformas: (1) observaciones crudas + calendario separado; (2) contrato de widgets v2 con `source` y
estados offline, leyendo v1 de forma retrocompatible; (3) perfiles como artefacto versionado con checksum y
versión anterior conservada. Primero estadística (cuantiles por franja); ML sólo con mejora medida.

## D9 — Ejecutar vitest con ruta de unidad en mayúscula en Windows
Con `/e/...` (Git Bash) vitest carga dos instancias del runner. Documentado en `docs/testing-results.md`.

## D11 — Ejecutor de alertas local y limitado (2026-11-11)
Corre sólo con la app abierta y visible, cada 60 s, sólo para pares (parada, línea) de reglas activas en ese
horario y con tope de 8 consultas por ciclo. Datos STALE no disparan alertas. Si el sistema no deja mostrar la
notificación (sin permiso), no se marca como enviada. La UI informa que con la app cerrada no hay garantía
(alertas exactas en segundo plano = push servidor, B3).

## D12 — Ubicación para «¿Cuándo salgo?»
Se pide sólo al tocar «Usar mi ubicación», con precisión baja. Se guarda únicamente el resultado (minutos de
caminata por parada) en LocalStorage; nunca coordenadas del usuario.

## D13 — Inferencia de ML en TypeScript sin dependencias (2026-11-11)
El artefacto exporta árboles LightGBM compactos y un evaluador TS (≈40 líneas) los recorre. Evita ONNX/servicio Python
en producción. Paridad verificada con casos incluidos en el artefacto; en CI la verificación es semántica porque
LightGBM genera umbrales levemente distintos entre plataformas.

## D14 — Planificador: capa de preferencias sobre RAPTOR
No se modifica el algoritmo existente: se reordena/filtra su salida (preferencias y horarios). La primera espera con
arribo en vivo está implementada como función pura pero no conectada a la UI, para no sumar consultas automáticas.

## D15 — Personalización local opt-in
Sólo `favId` + minuto, en LocalStorage, 60 días, máx. 200 eventos. Apagada por defecto; desactivar borra. Mayoría
estricta en la franja para sugerir (evita sugerencias arbitrarias en empates).

## D16 — Asistente: proveedor intercambiable y fundamentación obligatoria
LLM → herramientas tipadas → datos de la app. El modelo nunca calcula arribos ni rutas. Todo «N min» de la respuesta
debe aparecer en resultados/entradas de herramientas; si no, se responde sólo con datos. Claude se usa con el SDK
oficial, modelo `claude-opus-5-5`, esfuerzo `low` (chat, costo), `tool_choice` auto + `strict`, y fallback del lado del
servidor ante rechazos (`fallbacks: "default"`). Sin clave, un proveedor simulado por reglas cubre las intenciones
frecuentes sin costo. No se guardan conversaciones; al modelo sólo van favoritos y, si el usuario la comparte, la
ubicación redondeada a ~100 m.

## D17 — Widgets offline: tabla precalculada en la web, búsqueda trivial en nativo (2026-11-11)
En vez de portar el motor estadístico a Kotlin y Swift (tres implementaciones de calendario, feriados y redondeos), la
web arma desde el perfil ya validado una tabla `offline_v1`: tipo de día resuelto para los próximos 14 días (por día
local desde 1970, sin formateo de fechas en nativo) y por franja `[franja, mediana, máximo, días]`. El widget sólo busca
franja exacta → anterior → siguiente, igual que el motor web. Pasado el horizonte no estima (perfil viejo). El contrato
v1 de configuraciones y snapshots no cambia: un shell nativo viejo ignora la tabla y la web tolera que el método falte.
La estimación sólo se muestra si no hay dato en vivo usable (sin dato, vencido o error sin arribos), con «≈», el texto
«histórico» y el pie «Sin datos en vivo · estimación histórica». Un dato en vivo reciente, aunque diga «sin arribos»,
siempre gana. Paridad: `shared/contracts/offline-vectors.json` en vitest, JUnit y XCTest.

## D18 — Históricos con autorización: sólo pasivos, 1 año, inferencia por job (2026-11-11)
El responsable confirma la autorización escrita de uso de datos (el documento queda fuera del repo). Decisiones suyas:
recolección **sólo pasiva** (se muestrean, 1/min por parada+línea, las consultas que la app ya hace para sus usuarios;
no hay colector que consulte a la Municipalidad) y retención cruda de **1 año** (migración nueva, no se editó la
anterior; llegadas inferidas 2 años; purga diaria con pg_cron si está disponible). Las llegadas se infieren en el
servidor con un job idempotente (`/api/cron/infer-arrivals`, ventana de 3 h con zona central, UNIQUE descarta repetidas)
y se exportan con `scripts/export-arrival-history.mjs` al pipeline `ml/` (perfiles offline y ML). Consecuencia
asumida: la cobertura sigue al uso (buena en horas pico y líneas populares, pobre de noche); los perfiles exigen soporte
mínimo y, si no lo hay, el modo offline dice «datos insuficientes».

## D19 — Marca propia configurable y experiencia simple (2026-11-12)
La marca vive en `shared/brand.ts` (nombre, colores, textos, ids) y `scripts/apply-brand.mjs` la aplica a los proyectos
nativos; cambiar de nombre es tocar un archivo. Se quitaron AdSense, el tablero de anunciantes con pagos (y
`mercadopago`), Google Analytics, Microsoft Clarity y Vercel Analytics: no hay publicidad ni rastreadores de terceros
(resuelve B11). Se sacó también el contenido de la marca original (portada, blog, estadísticas, `/android`, `/contacto`,
promo de Play, `security.txt`); términos, privacidad y «Acerca de» son propios.
Las migraciones históricas `ad_*` siguen sin usarse (no hay migración de drop para local; decidir antes de producción).
Inicio = buscador abajo (alcance del pulgar) + tarjeta «Ahora» + paradas guardadas agrupadas por esquina con minutos en
vivo. La búsqueda usa un índice local (`/api/search-index` + `quickSearch`), sin pedir al municipio por cada letra. La
navegación son tres pestañas (Inicio, Viajes, Más). El detalle de la parada ordena por importancia (minutos primero) y
tiene una barra Guardar · Avisarme (alerta de un toque) · Compartir. Los estados de confianza del dato (en vivo,
envejeciendo, vencido, histórico, sin datos) viven en un solo componente, `ArrivalTime`. Las consultas en vivo de
Inicio se acotan a 6 filas. Las métricas de experiencia propias (`/api/ux`) son anónimas y están apagadas por defecto.
Se mantuvieron a propósito las claves de almacenamiento (`bondimdp-theme`, `bondi:*`, `cuandollega_*`) y los ids de
paquete (`com.bondimdp.*`): cambiarlos borraría datos locales y rompería la actualización de la app publicada (B6).