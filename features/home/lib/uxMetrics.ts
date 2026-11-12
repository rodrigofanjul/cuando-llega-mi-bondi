import { z } from "zod";

import { normalizeText } from "@features/search/lib/normalize";

export const uxEventSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("time_to_minutes"), ms: z.number().int().min(0).max(120_000) }),
    z.object({ type: z.literal("taps_to_minutes"), taps: z.number().int().min(0).max(20) }),
    z.object({ type: z.literal("search_miss"), q: z.string().min(3).max(80) }),
    z.object({ type: z.literal("quick_alert") }),
]);
export type UxEvent = z.infer<typeof uxEventSchema>;

/** Búsquedas sin resultado: sólo texto normalizado, sin números de 4+ dígitos (evita direcciones). */
export function sanitizeMissQuery(q: string): string | null {
    const n = normalizeText(q);
    if (n.length < 3 || /\d{4,}/.test(n)) return null;
    return n.slice(0, 80);
}

export function sendUx(event: UxEvent): void {
    if (process.env.NEXT_PUBLIC_UX_METRICS_ENABLED !== "true") return;
    try {
        void fetch("/api/ux", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(event), keepalive: true });
    } catch {
        // Métricas opcionales.
    }
}

let firstMinutesSent = false;

/** Tiempo hasta ver los primeros minutos en vivo; se envía una sola vez por carga de página. */
export function reportFirstMinutes(): void {
    if (firstMinutesSent) return;
    firstMinutesSent = true;
    sendUx({ type: "time_to_minutes", ms: Math.min(120_000, Math.round(performance.now())) });
}
