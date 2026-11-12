import { arLocalParts } from "@shared/time/argentina";

import { alertRuleSchema, type AlertRule } from "./engine";

export interface QuickAlertInput {
    id: string;
    target: { stopId: string; stopLabel: string; lineCode: string; lineLabel: string; destination: string };
    walkMin: number | null;
    now: number;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** «Avisarme» en un toque (spec §6): cuando falte lo justo para salir, durante las próximas 2 h de hoy. */
export function quickAlertRule(input: QuickAlertInput): AlertRule {
    const minutes = Math.min(60, Math.max(1, input.walkMin === null ? 5 : input.walkMin + 2));
    const { date, minuteOfDay } = arLocalParts(input.now);
    // La ventana no cruza medianoche: a las 23:59 queda 23:59–23:59 (el schema no admite más).
    const to = Math.min(23 * 60 + 59, minuteOfDay + 120);
    return alertRuleSchema.parse({
        id: input.id,
        enabled: true,
        targets: [input.target],
        trigger: { type: "eta-threshold", minutes },
        schedule: { type: "once", date, from: hhmm(minuteOfDay), to: hhmm(to) },
    });
}
