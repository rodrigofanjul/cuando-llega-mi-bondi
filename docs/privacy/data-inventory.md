# Inventario de datos (base para las declaraciones de las tiendas)

Relevado del código el 2026-11-11. «Dispositivo» = LocalStorage / SharedPreferences / App Group: no sale del teléfono.

| Dato | Dónde se origina | Dónde queda | ¿Vinculado a identidad? | Finalidad | Borrado |
| ---- | ---------------- | ----------- | ----------------------- | --------- | ------- |
| Favoritos, historial, lugares recientes | App | Dispositivo | No | Funcionalidad | Perfil → «Borrar datos de este dispositivo» |
| Configuración de widgets y alertas | App | Dispositivo (+ SharedPreferences/App Group para el widget) | No | Funcionalidad | Ídem (también vacía la config. de widgets nativos) |
| Hábitos (favorito + minuto) | App, **opt-in** | Dispositivo, 60 días | No | Personalización | Desactivar o borrar en Favoritos |
| Minutos de caminata por parada | App | Dispositivo | No | Funcionalidad | Ídem |
| Ubicación aproximada (paradas cerca, «cuándo salgo», asistente) | Dispositivo, a pedido | No se guarda; al asistente se envía redondeada a ~100 m | No | Funcionalidad | No aplica |
| Ubicación precisa en vivo (compartir viaje por Telegram) | Usuario, voluntario | Supabase `bus_locations` (definición y retención **fuera del repo**) | Posible (bot de Telegram) | Funcionalidad (mapa en vivo) | **A verificar** (B13) |
| Email (cuenta para reseñas, OTP) | Usuario | Supabase Auth | Sí | Cuenta | Perfil → «Eliminar cuenta» (`/api/account/delete`) |
| Reseñas de líneas | Usuario | Supabase | Sí (nombre visible elegido) | Contenido del usuario | Con la cuenta (se anonimizan) |
| Reportes colaborativos | Usuario | Supabase `community_reports` (hash con sal de id aleatorio, sin IP) | No | Funcionalidad | Caducan solos; purga a 30 días de vencidos |
| Id aleatorio de dispositivo | App | Dispositivo (servidor sólo guarda el hash) | No | Antispam | Borrado local |
| Observaciones de arribos (histórico) | Consultas de la app (sólo pasiva), **apagado** hasta activar en producción | Supabase, 1 año crudo; llegadas inferidas 2 años | No (sin usuario, sin ubicación) | Analítica de servicio / ML | Retención automática |
| Preguntas al asistente | Usuario | No se guardan; si hay clave, se envían a Anthropic con favoritos | No | Funcionalidad | No aplica |
| Métricas de experiencia propias (`/api/ux`) | App, **apagado por defecto** (`NEXT_PUBLIC_UX_METRICS_ENABLED`) | Contadores en memoria; búsquedas sin resultado normalizadas en logs del servidor | No (sin identificador, sin IP guardada) | Mejora de la experiencia | No aplica |
| IP | Toda request | Sólo en memoria para límites de frecuencia (no se guarda ni se loguea) | — | Seguridad | No aplica |

Notas:
- El código nativo propio (widgets, plugin) **no recolecta ni envía datos**: sólo lee/escribe almacenamiento local y consulta el mismo endpoint de arribos.
- La **WebView** no carga scripts de terceros de analítica, grabación de sesión ni publicidad (se quitaron; B11 resuelto): no hay rastreo.
