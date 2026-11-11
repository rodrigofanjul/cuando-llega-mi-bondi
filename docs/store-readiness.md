# Preparación para tiendas

**Publicar requiere autorización explícita.** Nada de esto se ejecutó contra las tiendas.

## Android (Google Play)
| Ítem | Estado |
| ---- | ------ |
| Proyecto Android Studio (Capacitor 8, Kotlin, Glance) | Listo; compila local y en CI |
| APK debug | Generado (CI artefacto `android-artifacts`) |
| AAB release | Job de CI listo; corre sólo con secretos `BONDI_KEYSTORE_*` |
| Firma | Por variables de entorno; sin claves en el repo |
| `applicationId` | `com.bondimdp.app.dev` por defecto. Reemplazar la app publicada exige el keystore original (B6) |
| `targetSdk` | 36 |
| Permisos | INTERNET, ubicación (a pedido), notificaciones en tiempo de ejecución |
| Data safety | Borrador en `docs/privacy/google-data-safety.md` (depende de B11) |
| Pruebas | Unit tests JVM + widget verificado en emulador API 36 con datos MOCK |
| Pendiente | Prueba en dispositivo físico, capturas de tienda, ficha, track interno |

## iOS (App Store / TestFlight)
| Ítem | Estado |
| ---- | ------ |
| Proyecto Xcode + extensión WidgetKit (App Intents, iOS 17+) | Compila en CI (Xcode 16.4, simulador, sin firma) |
| App Group | `group.<bundle id>`; registrarlo en Apple Developer |
| Manifiestos de privacidad | Incluidos (app y widget) |
| Ubicación | `NSLocationWhenInUseUsageDescription` agregado |
| Firma / TestFlight | Requiere cuenta Apple Developer, certificados y perfiles (B4); `BONDI_IOS_TEAM_ID` en el script |
| Etiquetas de privacidad | Borrador en `docs/privacy/apple-app-privacy.md` (depende de B11; ATT si hay rastreo) |
| Pendiente | Ejecución en simulador/dispositivo (sin Mac, B2), capturas, ficha, revisión |

## Checklist común antes de enviar
- [ ] B1 alcance de datos documentado (uso comercial).
- [ ] B10 mosaicos de mapa con licencia.
- [ ] B11 decisión sobre analytics/anuncios dentro de la app.
- [ ] Política de privacidad actualizada (widgets, alertas, reportes, asistente, borrado local).
- [ ] `CAP_SERVER_URL` de producción y prueba de modo sin conexión (`offline.html`).
- [ ] Pruebas en dispositivos físicos (Android e iOS).
