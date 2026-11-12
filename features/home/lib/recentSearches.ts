export const RECENTS_KEY = "bondi:recent-searches";

export function pushRecent(list: string[], q: string): string[] {
    const t = q.trim();
    if (!t) return list;
    return [t, ...list.filter((x) => x !== t)].slice(0, 3);
}

export function loadRecents(): string[] {
    try {
        const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 3) : [];
    } catch {
        return [];
    }
}

export function saveRecents(list: string[]): void {
    try {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    } catch {
        // Almacenamiento no disponible: los recientes son una comodidad.
    }
}
