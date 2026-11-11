/**
 * Personalización LOCAL y opcional (§10). Sólo guarda qué favorito se consultó
 * y cuándo (minuto redondeado), en el dispositivo. Nunca ubicaciones.
 * Apagada por defecto; se puede borrar en cualquier momento.
 *
 * Sugerencia: el favorito que el usuario consulta habitualmente en esta franja
 * (±60 min) y este tipo de día (hábil / fin de semana), con soporte mínimo.
 */
import { arLocalParts } from "@shared/time/argentina";

export interface HabitEvent {
    favId: string;
    /** Epoch ms redondeado al minuto. */
    at: number;
}

export const MAX_EVENTS = 200;
export const RETENTION_DAYS = 60;
const WINDOW_MIN = 60;
const MIN_OCCURRENCES = 3;
const MIN_SHARE = 0.5;

export function recordEvent(events: HabitEvent[], favId: string, now: number): HabitEvent[] {
    const at = now - (now % 60_000);
    const cutoff = now - RETENTION_DAYS * 86_400_000;
    return [...events.filter((e) => e.at >= cutoff), { favId, at }].slice(-MAX_EVENTS);
}

function dayKind(weekday: number): "weekday" | "weekend" {
    return weekday === 0 || weekday === 6 ? "weekend" : "weekday";
}

function minuteDistance(a: number, b: number): number {
    const d = Math.abs(a - b);
    return Math.min(d, 1440 - d);
}

export interface Suggestion {
    favId: string;
    occurrences: number;
    /** Proporción de las consultas de esta franja que fueron a este favorito. */
    share: number;
    /** Explicación para el usuario (transparencia). */
    reason: string;
}

export function suggest(events: HabitEvent[], now: number, existingFavIds: Set<string>): Suggestion | null {
    const nowParts = arLocalParts(now);
    const kind = dayKind(nowParts.weekday);
    const cutoff = now - RETENTION_DAYS * 86_400_000;
    const relevant = events.filter((e) => {
        if (e.at < cutoff || !existingFavIds.has(e.favId)) return false;
        const p = arLocalParts(e.at);
        return dayKind(p.weekday) === kind && minuteDistance(p.minuteOfDay, nowParts.minuteOfDay) <= WINDOW_MIN;
    });
    if (relevant.length < MIN_OCCURRENCES) return null;
    const counts = new Map<string, number>();
    for (const e of relevant) counts.set(e.favId, (counts.get(e.favId) ?? 0) + 1);
    const [favId, occurrences] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = occurrences / relevant.length;
    // Mayoría estricta: en un empate no hay hábito claro.
    if (occurrences < MIN_OCCURRENCES || share <= MIN_SHARE) return null;
    const when = kind === "weekday" ? "los días hábiles" : "los fines de semana";
    return {
        favId,
        occurrences,
        share,
        reason: `Lo consultaste ${occurrences} veces ${when} a esta hora en los últimos ${RETENTION_DAYS} días.`,
    };
}
