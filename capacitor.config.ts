import type { CapacitorConfig } from "@capacitor/cli";
import { BRAND } from "./shared/brand";

/**
 * Shell nativo en modo `server.url`: la WebView carga el sitio desplegado, así
 * se conservan SSR, route handlers y Cache Components (docs/decisions.md D3).
 * `mobile/www` sólo contiene la pantalla offline (`errorPath`).
 *
 * `CAP_APP_ID` default `.dev` para no colisionar con la app publicada
 * `com.bondimdp.app`, cuyo proyecto nativo no está en este repo (blocker B6).
 */
const isLocalUrl = (u: string) => /^https?:\/\/(localhost|10\.0\.2\.2|127\.0\.0\.1|192\.168\.)/.test(u);
const envUrl = process.env.CAP_SERVER_URL?.trim();
const isRelease = process.env.CAP_RELEASE === "1" || process.env.NODE_ENV === "production";
const serverUrl = envUrl || BRAND.appUrl;
// Un build de release nunca debe apuntar a localhost ni a un default sin configurar.
if (isRelease && (!envUrl || isLocalUrl(serverUrl))) {
    throw new Error(
        "Build de release: definí CAP_SERVER_URL con la URL https pública de la app (no localhost). Ver docs/mobile.md.",
    );
}
const isLocalDev = isLocalUrl(serverUrl) && serverUrl.startsWith("http:");
const serverHost = new URL(serverUrl).hostname;
const config: CapacitorConfig = {
    appId: process.env.CAP_APP_ID?.trim() || "com.bondimdp.app.dev",
    appName: "Cuándo Viene",
    webDir: "mobile/www",
    server: {
        url: serverUrl,
        cleartext: isLocalDev,
        errorPath: "offline.html",
        allowNavigation: [serverHost, `*.${serverHost}`],
    },
    android: {
        allowMixedContent: false,
    },
    ios: {
        contentInset: "automatic",
    },
    plugins: {
        LocalNotifications: {
            iconColor: "#0099ff",
        },
    },
};

export default config;
