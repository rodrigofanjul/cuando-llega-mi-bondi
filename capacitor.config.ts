import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Shell nativo en modo `server.url`: la WebView carga el sitio desplegado, así
 * se conservan SSR, route handlers y Cache Components (docs/decisions.md D3).
 * `mobile/www` sólo contiene la pantalla offline (`errorPath`).
 *
 * `CAP_APP_ID` default `.dev` para no colisionar con la app publicada
 * `com.bondimdp.app`, cuyo proyecto nativo no está en este repo (blocker B6).
 */
const serverUrl = process.env.CAP_SERVER_URL?.trim() || "https://bondimdp.com.ar";
const isLocalDev = /^http:\/\/(localhost|10\.0\.2\.2|127\.0\.0\.1|192\.168\.)/.test(serverUrl);

const config: CapacitorConfig = {
    appId: process.env.CAP_APP_ID?.trim() || "com.bondimdp.app.dev",
    appName: "Cuándo Viene",
    webDir: "mobile/www",
    server: {
        url: serverUrl,
        cleartext: isLocalDev,
        errorPath: "offline.html",
        allowNavigation: ["bondimdp.com.ar", "*.bondimdp.com.ar"],
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
