# Apps móviles (Capacitor) y widgets nativos

## Arquitectura

- Shell Capacitor 8.5.3 en modo `server.url`: carga el sitio desplegado (`CAP_SERVER_URL`, default `https://bondimdp.com.ar`). Sin red se muestra `mobile/www/offline.html`.
- La web guarda las configuraciones de widgets y comparte los arribos ya consultados a través del plugin `BondiWidget` (`features/widgets/native/bridge.ts`).
- Los widgets leen ese almacenamiento compartido y, si el dato tiene más de 90 s, consultan **el mismo endpoint** que usa la web (`{apiBase}/mgp/RecuperarProximosArribosW`). Una request por par (parada, línea), compartida entre widgets, con un máximo de 12 por ejecución.
- La lógica está replicada en TS (`features/widgets/lib`), Kotlin (`widget/core`) y Swift (`ios/BondiWidgetCore`), y se valida contra `shared/contracts/arrival-vectors.json`.

## Android

Requisitos: JDK 21 y Android SDK 36.

```bash
bun install
CAP_SERVER_URL=https://bondimdp.com.ar npx cap sync android
cd android
./gradlew testDebugUnitTest      # tests JVM (vectores compartidos)
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
```

- `applicationId` por defecto: `com.bondimdp.app.dev`. Usar `-PbondiAppId=com.bondimdp.app` **sólo** con el keystore de la app publicada (B6).
- Firma de release: variables `BONDI_KEYSTORE_PATH`, `BONDI_KEYSTORE_PASSWORD`, `BONDI_KEY_ALIAS` y `BONDI_KEY_PASSWORD`. En CI, el secreto `BONDI_KEYSTORE_BASE64` habilita `bundleRelease` (AAB).
- Desarrollo local contra `next dev` desde el emulador: `CAP_SERVER_URL=http://10.0.2.2:3000` (con eso se habilita `cleartext`).
- Widget: mantener presionado el escritorio → Widgets → «Próximo bondi». La actualización periódica es de 15 min como mínimo y no está garantizada; además se actualiza al abrir la app y con el botón ↻.

## iOS (requiere macOS)

```bash
bun install
npx cap sync ios
gem install xcodeproj
BONDI_IOS_BUNDLE_ID=com.bondimdp.app.dev ruby ios/scripts/add_widget_target.rb   # idempotente
open ios/App/App.xcodeproj
swift test --package-path ios/BondiWidgetCore
```

- El script agrega la extensión `BondiWidgetExtension` (iOS 17+, App Intents para elegir la configuración de cada widget), el plugin, el `BondiBridgeViewController` y el App Group `group.<bundle id>`. **Es obligatorio**: el storyboard ya referencia `BondiBridgeViewController`.
- Para firmar, el App Group tiene que estar registrado en Apple Developer, y hay que definir `BONDI_IOS_TEAM_ID`. Para TestFlight hacen falta cuenta, certificados y aprobación explícita (B4).
- iOS administra el presupuesto de recargas. El timeline genera una entrada por minuto, que descuenta los minutos localmente, durante 10 minutos; después el dato se muestra como «Vencido».

## Qué no está verificado todavía

Ver `docs/testing-results.md`. El código nativo no se compiló en este entorno; los jobs `android`, `ios-core` e `ios-build` de CI lo van a verificar.
