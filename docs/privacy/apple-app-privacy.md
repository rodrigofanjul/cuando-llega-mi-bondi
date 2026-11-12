# App Store: privacidad (borrador para App Store Connect)

Fuente: `docs/privacy/data-inventory.md`. **No enviar sin resolver B11** (rastreo en la WebView).

## Manifiestos de privacidad (incluidos)
- `ios/App/App/PrivacyInfo.xcprivacy` y `ios/App/BondiWidgetExtension/PrivacyInfo.xcprivacy`: `NSPrivacyTracking=false`,
  sin datos recolectados por el código nativo, `UserDefaults` con razón `1C8F.1` (App Group compartido con el widget).
  El script `ios/scripts/add_widget_target.rb` los agrega como recursos.
- Capacitor y sus plugins incluyen sus propios manifiestos.

## Etiquetas («Data Used to Track You / Linked / Not Linked»)

Dos escenarios según la decisión de B11:

### A. La app nativa NO carga GA, Clarity ni AdSense (recomendado)
| Tipo | Categoría Apple | Vinculado | Rastreo | Uso |
| ---- | --------------- | --------- | ------- | --- |
| Email | Contact Info → Email Address | Sí | No | App Functionality |
| Reseñas | User Content → Other User Content | Sí | No | App Functionality |
| Ubicación en vivo (Telegram, voluntaria) | Location → Precise Location | Sí (si se vincula al chat) | No | App Functionality |
| Métricas anónimas (Vercel) | Usage Data → Product Interaction | No | No | Analytics |
No requiere App Tracking Transparency.

### B. La app nativa carga el sitio tal cual (GA + Clarity + AdSense)
Sumar: Identifiers → Device ID, Usage Data → Product Interaction / Advertising Data, Diagnostics, con **Rastreo: Sí**
para publicidad personalizada. **Requiere el aviso de App Tracking Transparency** antes de cargar esos scripts, y
respetar la negativa (anuncios no personalizados, sin GA/Clarity). Más riesgo de rechazo en revisión.

## Otros requisitos de revisión
- Eliminación de cuenta dentro de la app: existe (Perfil → Eliminar cuenta).
- Link a la política de privacidad: `https://bondimdp.com.ar/privacidad` (actualizarla con widgets, alertas, reportes, asistente).
- Guideline 4.2 (funcionalidad mínima): la app no es un mero sitio envuelto — aporta widgets nativos y notificaciones.
- Ubicación: textos `NSLocationWhenInUseUsageDescription` en `Info.plist` antes de pedir permiso desde la WebView.
