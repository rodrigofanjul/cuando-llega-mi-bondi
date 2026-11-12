# App Store: privacidad (borrador para App Store Connect)

Fuente: `docs/privacy/data-inventory.md`. B11 resuelto: el sitio y la WebView no cargan analítica ni publicidad de terceros (sin rastreo).

## Manifiestos de privacidad (incluidos)
- `ios/App/App/PrivacyInfo.xcprivacy` y `ios/App/BondiWidgetExtension/PrivacyInfo.xcprivacy`: `NSPrivacyTracking=false`,
  sin datos recolectados por el código nativo, `UserDefaults` con razón `1C8F.1` (App Group compartido con el widget).
  El script `ios/scripts/add_widget_target.rb` los agrega como recursos.
- Capacitor y sus plugins incluyen sus propios manifiestos.

## Etiquetas («Data Used to Track You / Linked / Not Linked»)

La app no rastrea: no hay scripts de terceros de analítica ni publicidad.

| Tipo | Categoría Apple | Vinculado | Rastreo | Uso |
| ---- | --------------- | --------- | ------- | --- |
| Email | Contact Info → Email Address | Sí | No | App Functionality |
| Reseñas | User Content → Other User Content | Sí | No | App Functionality |
| Ubicación en vivo (Telegram, voluntaria) | Location → Precise Location | Sí (si se vincula al chat) | No | App Functionality |
No requiere App Tracking Transparency. Las métricas de experiencia propias (/api/ux) están apagadas por defecto; si se activan, son anónimas (sin identificador) y no se declaran como rastreo.

## Otros requisitos de revisión
- Eliminación de cuenta dentro de la app: existe (Perfil → Eliminar cuenta).
- Link a la política de privacidad: `https://bondimdp.com.ar/privacidad` (actualizarla con widgets, alertas, reportes, asistente).
- Guideline 4.2 (funcionalidad mínima): la app no es un mero sitio envuelto — aporta widgets nativos y notificaciones.
- Ubicación: textos `NSLocationWhenInUseUsageDescription` en `Info.plist` antes de pedir permiso desde la WebView.
