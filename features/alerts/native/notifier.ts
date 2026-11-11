/**
 * Entrega de notificaciones locales. Nativo: @capacitor/local-notifications.
 * Web: Notification API. El permiso sólo se pide ante una acción explícita
 * del usuario (botón en /alertas), nunca automáticamente.
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

import type { AlertNotification } from "@features/alerts/lib/engine";

export type PermissionStatus = "granted" | "denied" | "prompt" | "unsupported";

const isNative = () => Capacitor.isNativePlatform();
const hasWebNotifications = () => typeof window !== "undefined" && "Notification" in window;

/** ID entero de 31 bits estable a partir de la clave de deduplicación (requisito de LocalNotifications). */
export function notificationId(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
    return Math.abs(h) % 2_147_483_647;
}

function mapNative(display: string): PermissionStatus {
    if (display === "granted") return "granted";
    if (display === "denied") return "denied";
    return "prompt";
}

function mapWeb(p: NotificationPermission): PermissionStatus {
    return p === "default" ? "prompt" : p;
}

export async function getNotificationPermission(): Promise<PermissionStatus> {
    if (isNative()) return mapNative((await LocalNotifications.checkPermissions()).display);
    if (!hasWebNotifications()) return "unsupported";
    return mapWeb(Notification.permission);
}

export async function requestNotificationPermission(): Promise<PermissionStatus> {
    if (isNative()) return mapNative((await LocalNotifications.requestPermissions()).display);
    if (!hasWebNotifications()) return "unsupported";
    return mapWeb(await Notification.requestPermission());
}

export async function deliverNotification(n: AlertNotification): Promise<boolean> {
    if (isNative()) {
        if ((await LocalNotifications.checkPermissions()).display !== "granted") return false;
        await LocalNotifications.schedule({
            notifications: [{ id: notificationId(n.dedupeKey), title: n.title, body: n.body }],
        });
        return true;
    }
    if (!hasWebNotifications() || Notification.permission !== "granted") return false;
    // `tag` evita duplicados visibles si el mismo aviso se repite.
    new Notification(n.title, { body: n.body, tag: n.dedupeKey, icon: "/icon-192x192.png" });
    return true;
}
