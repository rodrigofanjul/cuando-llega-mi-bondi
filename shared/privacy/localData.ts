/**
 * Datos que la app guarda en el dispositivo (LocalStorage). Todas las claves
 * propias usan estos prefijos: favoritos, historial, widgets, alertas, hábitos,
 * minutos de caminata, id de dispositivo para reportes, lugares recientes,
 * cachés de catálogo y avisos de la PWA. No incluye preferencias de terceros
 * (tema) ni la sesión de cuenta (se cierra desde «Cerrar sesión»).
 */
export const APP_KEY_PREFIXES = ["bondi:", "bondimdp:", "cuandollega_"] as const;

type KeyStorage = Pick<Storage, "length" | "key" | "removeItem">;

export function listAppKeys(storage: KeyStorage): string[] {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && APP_KEY_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    return keys.sort();
}

/** Borra todas las claves propias; devuelve cuántas borró. */
export function clearAppData(storage: KeyStorage): number {
    const keys = listAppKeys(storage);
    for (const k of keys) storage.removeItem(k);
    return keys.length;
}
