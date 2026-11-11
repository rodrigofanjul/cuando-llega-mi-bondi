# Google Play: Data safety (borrador)

Fuente: `docs/privacy/data-inventory.md`. Las respuestas cambian según B11 (scripts de terceros en la WebView).

| Pregunta | Respuesta (escenario A: sin GA/Clarity/AdSense en la app) |
| -------- | ---------------------------------------------------------- |
| ¿Recolecta o comparte datos? | Sí (recolecta) |
| ¿Datos cifrados en tránsito? | Sí (HTTPS; HTTP sólo en builds debug hacia el entorno local) |
| ¿El usuario puede pedir que se borren? | Sí: «Eliminar cuenta» y «Borrar datos de este dispositivo» |
| Email | Recolectado · Gestión de cuenta · Opcional |
| Ubicación precisa | Recolectada sólo si el usuario comparte su viaje · Funcionalidad · Opcional |
| Ubicación aproximada | **No recolectada** (se usa en el dispositivo; al asistente va redondeada y no se guarda → declarar si se activa Claude) |
| Contenido generado (reseñas, reportes) | Recolectado · Funcionalidad · Opcional |
| Interacciones en la app | Recolectadas de forma anónima (Vercel) · Analítica |
| Compartido con terceros | No (escenario A). Con Claude activo: preguntas + favoritos a Anthropic como proveedor de servicio |

**Escenario B** (sitio tal cual): sumar identificadores de dispositivo, interacciones y datos de publicidad
**compartidos** con Google y Microsoft para analítica y publicidad.

Otros:
- `targetSdkVersion` 36 (cumple el requisito vigente de Play).
- Permisos declarados: `INTERNET`; notificaciones (Android 13+) se piden en tiempo de ejecución desde `/alertas`.
- Política de privacidad: `https://bondimdp.com.ar/privacidad`.
