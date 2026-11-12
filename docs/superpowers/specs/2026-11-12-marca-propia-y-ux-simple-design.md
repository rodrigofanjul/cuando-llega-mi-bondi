# Marca propia y experiencia simple — diseño

Fecha: 2026-11-12 · Rama: `feature/next-gen-platform` (fork `rodrigofanjul/cuando-llega-mi-bondi`)

## Objetivo

Que la app sea la forma más rápida de la ciudad de saber cuándo viene el colectivo: abrir y ver los minutos en menos de
3 segundos, con una mano. Además, dejar de usar la identidad de «Bondi MDP» y pasar a una marca propia configurable.

Criterios de éxito (medibles):

| Métrica | Meta |
| ------- | ---- |
| Paradas guardadas visibles al abrir (desde caché local) | < 1 s en gama media |
| Minutos frescos en pantalla | < 3 s |
| Sesiones con minutos en ≤ 2 toques | > 80 % |
| Búsqueda local por tecla | < 50 ms |
| JS inicial de Inicio (comprimido) | < 150 KB |

## Decisiones tomadas

1. **Uso central:** si hay paradas guardadas, se ven al abrir; si no, una sola caja de búsqueda rápida.
2. **Se conservan todas las funciones** (viajes y mapa, avisos, comunidad, widgets); se simplifica la organización.
3. **Nombre todavía no definido:** marca configurable en un solo archivo; nombre provisorio «Cuándo Viene».
4. **Sin publicidad ni rastreadores de terceros.**
5. **Búsqueda:** caja única con índice local (opción A); la IA sólo entra con preguntas o sin resultados directos.
6. **Búsqueda abajo en celular, arriba en escritorio; tarjetas agrupadas por esquina.**

## 1. Marca configurable

- `shared/brand.ts`: `name`, `shortName`, `domain`, `appUrl`, `accentColor`, `contactEmail`, `description`,
  `originalProjectCredit`. Única fuente para textos, metadatos (`layout.tsx`, `manifest`, Open Graph, JSON-LD), títulos,
  notificaciones, mensajes del asistente y textos de los widgets.
- Nativos: `capacitor.config.ts` toma `appName` de `brand.ts`; Android (`strings.xml`) e iOS (`Info.plist`,
  `CFBundleDisplayName`) se regeneran con un script `scripts/apply-brand.mjs` (no se editan a mano).
- Íconos: set provisorio generado (monograma con el color de acento) en `public/brand/`; reemplazable sin tocar código.
- `package.json` `name` → nombre técnico neutro. Claves de almacenamiento local (`bondi:*`, `bondimdp:*`) **no cambian**:
  cambiarlas borraría favoritos y configuraciones de quien ya usa la versión local.
- Licencia MIT: se conserva `LICENSE` con «Copyright (c) 2026 Celiz & Contributors» y se agrega el titular nuevo;
  «Acerca de» menciona que es un derivado del proyecto original.

## 2. Qué se elimina

| Bloque | Elementos |
| ------ | --------- |
| Publicidad | AdSense (`shared/ads/*`, rieles en paneles), tablero de anunciantes y pagos (`/anunciate`, `/anunciantes`, `app/api/ads/*`, `lib/mercadopago/*`, `features/sponsors/*`), dependencia `mercadopago` (cierra la parte de B12) |
| Rastreo | Google Analytics, Microsoft Clarity, Vercel Analytics (cierra B11) |
| Contenido de la marca original | Blog, prensa, testimonios, estadísticas (`/un-mes-en-numeros`, `/primer-trimestre-en-numeros`), `/android`, promo de Play Store, landing de marketing |
| Navegación vieja | Pestañas «Reseñas» y «Acerca de» |

Las migraciones `ad_*` quedan en el historial (no se reescriben migraciones aplicadas); una migración nueva no es
necesaria para la versión local porque las tablas sólo quedan sin uso. Se documenta en `docs/decisions.md`.

Se conservan: privacidad y términos (reescritos con `brand.ts`), páginas de recorrido por línea (útiles para buscadores y
sin marca), `/perfil` con el borrado de datos locales.

## 3. Estructura y navegación

Tres pestañas:

| Pestaña | Contenido |
| ------- | --------- |
| **Inicio** (`/`) | Tarjeta «Ahora», tus paradas por esquina, búsqueda |
| **Viajes** (`/viajes`) | «Cómo llego» y mapa de recorridos |
| **Más** (`/mas`) | Alertas, widgets, asistente (chat completo), personalización, reseñas, perfil y datos del dispositivo, acerca de |

Rutas existentes (`/consultar`, `/favoritos`, `/como-llego`, `/recorrido`, `/alertas`, `/widgets`, `/asistente`) siguen
funcionando: las que cambian de lugar redirigen (308) para no romper enlaces ni widgets nativos que abren la app.

## 4. Inicio

Orden en celular (de arriba hacia abajo): tarjeta «Ahora» → «Tus paradas» → barra inferior con búsqueda + pestañas.
En escritorio la búsqueda va arriba y las tarjetas en grilla.

**Tarjeta «Ahora»** (opcional): la parada probable según el horario aprendido (`features/personalization`) o, con
permiso, la ubicación (la parada guardada más cercana a < 400 m). Muestra línea, destino, esquina, próximos dos arribos y
la línea de «¿Cuándo salgo?». Sin contexto suficiente no se muestra.

**Tus paradas, agrupadas por esquina:** los favoritos se agrupan por (calle, intersección); cada grupo lista sus líneas
ordenadas por próximo arribo. Una consulta por par (parada, línea), compartiendo el polling de 25 s existente y
pausando cuando la pantalla no está visible. Entre consultas, cuenta regresiva local (como los widgets).

**Primera vez / sin guardados:** búsqueda enfocada (sin pantalla de bienvenida), y paradas cercanas si ya hay permiso de
ubicación. Tras la primera consulta, aviso discreto para guardar con ♥.

## 5. Búsqueda

**Índice local.** `scripts/build-search-index.mjs` genera desde `data/mgp-static-dump.json` un índice compacto
(`public/search/index-v1.json`): por línea, cada esquina con sus paradas (`Identificador`), sentidos/banderas y
coordenadas (desde los puntos del recorrido cuando estén disponibles). Se versiona con hash; se cachea en el dispositivo.

**Motor** (`features/search/lib/quickSearch.ts`, puro y testeable): normaliza (minúsculas, sin tildes, abreviaturas
«av/avda/gral/pte/dr»), tokeniza y clasifica la consulta:

| Entrada | Resultado |
| ------- | --------- |
| Sólo número de línea (`511`) | Calles de esa línea (al tocar, sus paradas) |
| Línea + texto (`511 luro`) | Paradas de esa línea sobre esa calle |
| Dos calles (`luro y salta`, `luro salta`) | Paradas de esa esquina, todas las líneas |
| Una calle (`luro`) | Esquinas de esa calle |
| `cerca` / botón 📍 | Paradas por distancia |

Tolerancia a errores de tipeo con distancia de edición ≤ 1 en palabras de 5+ letras. Orden: coincidencia exacta →
favoritos → cercanía. Máximo 8 resultados visibles.

**Asistente.** Si la consulta parece una pregunta (empieza con cómo/cuándo/dónde/qué/cuál, termina en «?», o no hay
coincidencias) se agrega «Preguntarle al asistente: …» como último resultado; sin coincidencias se abre directo.
Sin asistente disponible: «No encontré esa línea o calle» + «Buscar por calles» (formulario de 4 pasos actual).

**Antes de escribir:** chips con las últimas 3 búsquedas (locales) y «📍 Cerca mío». Teclado numérico por defecto
(`inputmode="numeric"` con conmutador a texto).

## 6. Detalle de parada

Hoja que sube sobre Inicio (no cambia de página): la línea elegida en grande, otras líneas de la misma esquina debajo,
botones fijos abajo **♥ Guardar · 🔔 Avisarme · ↗ Compartir**, luego avisos de demora, reportes de la comunidad (reportar
en un toque) y mapa del recorrido (carga diferida).

«Avisarme» en un toque crea una alerta «cuando falte lo justo para salir» (minutos de caminata de «¿Cuándo salgo?» + 2;
si no hay ubicación, 5 min). Mantener apretado permite elegir. Usa el motor de alertas existente.

## 7. Estados de confianza (componente único `ArrivalTime`)

| Estado | Presentación | Lector de pantalla |
| ------ | ------------ | ------------------ |
| En vivo (< 2 min) | Punto que late, color de acento | «llega en 4 minutos» |
| Envejeciendo (2–10 min) | Sin punto, «hace N min» | «dato de hace N minutos» |
| Vencido (≥ 10 min) | Gris, «Dato de las HH:MM», ↻ | «dato vencido de las HH:MM» |
| Histórico (sin conexión) | «≈ N min», gris, «histórico» | «estimación histórica, alrededor de N minutos» |
| Llegando | «Llegando», vibración corta si visible | «está llegando» |
| Sin servicio | «Sin arribos ahora» + frecuencia publicada si hay | ídem |

Reutiliza `features/arrivals/lib/freshness.ts` y `features/offline`. Nunca se muestra un dato viejo o estimado como en vivo.

## 8. Sistema visual

- Fondo neutro, un color de acento (`brand.accentColor`); colores fuertes sólo para chips de línea y «en vivo».
- Chips de línea con color estable por línea (paleta fija de 12 tonos con contraste AA sobre fondo claro y oscuro,
  asignada por hash del número).
- Tipografía del sistema; `font-variant-numeric: tabular-nums` en minutos; minutos principales 56 px, secundarios 20 px.
- Modo oscuro automático y modo «alto contraste» (para sol) en Más → Pantalla.
- Movimiento mínimo; se respeta `prefers-reduced-motion`.

## 9. Accesibilidad

Áreas táctiles ≥ 48 px; contraste AA (minutos AAA); textos al 200 % sin cortes (tarjetas se apilan); foco visible;
etiquetas completas para lector de pantalla; la búsqueda anuncia la cantidad de resultados (`aria-live="polite"`).

## 10. Rendimiento

Inicio se renderiza desde caché local (favoritos + últimos snapshots) antes de cualquier red. Mapa (Leaflet),
planificador (RAPTOR), asistente y reseñas se cargan con import dinámico. Índice de búsqueda: descarga en segundo plano
tras el primer render; mientras tanto la caja funciona contra favoritos y recientes.

## 11. Métricas propias (sin terceros)

Contadores anónimos agregados en el servidor propio (extensión de `lib/server/metrics.ts`, sin identificadores):
tiempo hasta minutos (p50/p90), toques hasta minutos, búsquedas sin resultado (texto normalizado, sólo si ≥ 3 caracteres
y sin números de más de 4 dígitos, para no registrar direcciones), uso de «Avisarme». Apagadas por defecto
(`NEXT_PUBLIC_UX_METRICS_ENABLED`).

## 12. Manejo de errores

- Sin red: último dato con su antigüedad + estimación histórica (Fase 9).
- Proveedor caído: mensaje del tipo de error existente (`errorInfo`) dentro de la tarjeta, sin bloquear las demás.
- Índice de búsqueda no disponible: búsqueda sobre favoritos/recientes + «Buscar por calles».
- Asistente sin clave: proveedor simulado actual.

## 13. Pruebas

- Unitarias: `quickSearch` (tabla de consultas reales y con errores de tipeo), agrupado por esquina, `ArrivalTime`
  (cada estado), selección de tarjeta «Ahora», `brand.ts` aplicado a metadatos.
- Script: `apply-brand.mjs` idempotente.
- Revisión: grep sin «Bondi MDP» / «bondimdp» fuera de `LICENSE`, `docs/` históricos y claves de almacenamiento.
- Navegador (upstream MOCK): flujo «abrir → ver favoritos → buscar `511 luro` → detalle → Avisarme», modo oscuro,
  texto 200 %, sin conexión.
- Tiempos medidos (Lighthouse móvil, throttling 4G) contra la tabla de metas.

## Fuera de alcance

Publicación en tiendas o dominio propio, logo definitivo, colores oficiales de líneas, cuentas de usuario, cambios en el
código de conexión de datos (`shared/api/client.ts`, `app/api/mgp/*`, `lib/server/mgpDirect.ts`).
