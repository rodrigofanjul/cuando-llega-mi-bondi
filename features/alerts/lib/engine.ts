/**
 * Motor de alertas puro: dado un conjunto de reglas, los snapshots de arribos
 * vigentes y el estado previo, decide qué notificar *ahora*.
 *
 * Garantías:
 * - Deduplicación: cada (regla, día local, colectivo) notifica una sola vez;
 *   sin id de unidad, se usa (regla, día, línea) con enfriamiento.
 * - Nada de alertas con datos vencidos (`stale`) o desconocidos.
 * - Una alerta de umbral exige ver el colectivo **por encima** del umbral en
 *   una evaluación previa o estar cerca del umbral, para no disparar por un
 *   salto espurio del ETA (reduce falsas alarmas).
 *
 * Ejecutor: este módulo no programa nada. Lo invoca el cliente mientras la
 * app está activa, o un servidor de push (Fase 3.3). Ver docs/decisions.md.
 */
import { z } from "zod";

import { freshnessOf, projectEtaMinutes } from "@features/arrivals/lib/freshness";
import { recommend, type AdvisorSettings, DEFAULT_ADVISOR } from "@features/departure/lib/advisor";
import { widgetTargetSchema } from "@features/widgets/lib/config";
import { snapshotKey, type SnapshotIndex } from "@features/widgets/lib/rows";
import { arLocalParts, inWindow, parseHhMm } from "@shared/time/argentina";

const hhmm = z.string().refine((v) => parseHhMm(v) !== null, "Hora inválida (HH:MM)");

export const alertTriggerSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("eta-threshold"), minutes: z.number().int().min(1).max(60) }),
    z.object({
        type: z.literal("leave-home"),
        walkMin: z.number().int().min(0).max(60),
        marginMin: z.number().int().min(0).max(30).default(2),
        /** Avisar cuando falten ≤ N min para la hora de salida. */
        leadMin: z.number().int().min(0).max(15).default(1),
    }),
    z.object({ type: z.literal("delay"), minDelayMin: z.number().int().min(1).max(120) }),
]);

export const alertScheduleSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("once"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        from: hhmm.default("00:00"),
        to: hhmm.default("00:00"),
    }),
    z.object({
        type: z.literal("recurring"),
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        from: hhmm,
        to: hhmm,
    }),
]);

export const alertRuleSchema = z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    enabled: z.boolean().default(true),
    targets: z.array(widgetTargetSchema).min(1).max(5),
    trigger: alertTriggerSchema,
    schedule: alertScheduleSchema,
    cooldownMin: z.number().int().min(1).max(240).default(15),
});
export type AlertRule = z.infer<typeof alertRuleSchema>;

export interface AlertNotification {
    ruleId: string;
    dedupeKey: string;
    title: string;
    body: string;
    at: number;
}

export interface AlertState {
    /** dedupeKey → epoch ms en que se notificó. */
    fired: Record<string, number>;
    /** `${ruleId}|${stop}|${line}|${vehicle}` → último ETA proyectado observado. */
    lastEta: Record<string, number>;
}

export const EMPTY_ALERT_STATE: AlertState = { fired: {}, lastEta: {} };

const DAY_MS = 86_400_000;

export function isScheduleActive(rule: AlertRule, now: number): boolean {
    const { weekday, minuteOfDay, date } = arLocalParts(now);
    const s = rule.schedule;
    const from = parseHhMm(s.from) ?? 0;
    const to = parseHhMm(s.to) ?? 0;
    if (s.type === "once") return s.date === date && inWindow(minuteOfDay, from, to);
    const crossed = from > to && minuteOfDay < to;
    const day = crossed ? (weekday + 6) % 7 : weekday;
    return s.days.includes(day) && inWindow(minuteOfDay, from, to);
}

/** Una alerta única que ya pasó su día puede eliminarse. */
export function isExpired(rule: AlertRule, now: number): boolean {
    return rule.schedule.type === "once" && rule.schedule.date < arLocalParts(now).date;
}

interface Candidate {
    stopId: string;
    lineCode: string;
    lineLabel: string;
    stopLabel: string;
    destination: string;
    vehicleId: string | null;
    eta: number;
    deviation: number | null;
}

function candidatesFor(rule: AlertRule, index: SnapshotIndex, now: number): Candidate[] {
    const out: Candidate[] = [];
    for (const t of rule.targets) {
        const snap = index.get(snapshotKey(t.stopId, t.lineCode));
        if (!snap || freshnessOf(snap.fetchedAt, now) === "stale") continue;
        for (const a of snap.arrivals) {
            if (a.stopId !== t.stopId || a.lineCode !== t.lineCode) continue;
            if (t.destination && a.destination.toUpperCase() !== t.destination.toUpperCase()) continue;
            const eta = projectEtaMinutes(a.etaMinutes, snap.fetchedAt, now);
            if (eta === null) continue;
            out.push({
                stopId: t.stopId,
                lineCode: t.lineCode,
                lineLabel: t.lineLabel,
                stopLabel: t.stopLabel,
                destination: a.destination,
                vehicleId: a.vehicleId,
                eta,
                deviation: a.deviationMinutes,
            });
        }
    }
    return out.sort((a, b) => a.eta - b.eta);
}

function dedupeKey(rule: AlertRule, c: Candidate, now: number): string {
    const { date } = arLocalParts(now);
    return `${rule.id}|${date}|${c.stopId}|${c.lineCode}|${c.vehicleId ?? "?"}`;
}

function alreadyFired(state: AlertState, key: string, rule: AlertRule, c: Candidate, now: number): boolean {
    if (state.fired[key] !== undefined) {
        // Con id de unidad: una vez por colectivo y día. Sin id: enfriamiento.
        return c.vehicleId !== null || now - state.fired[key] < rule.cooldownMin * 60_000;
    }
    return false;
}

function etaKey(rule: AlertRule, c: Candidate): string {
    return `${rule.id}|${c.stopId}|${c.lineCode}|${c.vehicleId ?? "?"}`;
}

/** Margen bajo el umbral que se acepta sin haber visto el cruce (ej. umbral 10 → 8..10). */
const CROSSING_TOLERANCE_MIN = 2;

export function evaluateAlerts(
    rules: AlertRule[],
    index: SnapshotIndex,
    prev: AlertState,
    now: number,
    advisor: AdvisorSettings = DEFAULT_ADVISOR,
): { notifications: AlertNotification[]; state: AlertState } {
    const fired: Record<string, number> = {};
    for (const [k, t] of Object.entries(prev.fired)) if (now - t < DAY_MS) fired[k] = t;
    const state: AlertState = { fired, lastEta: {} };
    const notifications: AlertNotification[] = [];

    for (const rule of rules) {
        if (!rule.enabled || !isScheduleActive(rule, now)) continue;
        const candidates = candidatesFor(rule, index, now);
        for (const c of candidates) state.lastEta[etaKey(rule, c)] = c.eta;

        const n = evaluateRule(rule, candidates, prev, now, advisor);
        if (!n) continue;
        const key = dedupeKey(rule, n.candidate, now);
        if (alreadyFired(state, key, rule, n.candidate, now)) continue;
        state.fired[key] = now;
        notifications.push({ ruleId: rule.id, dedupeKey: key, title: n.title, body: n.body, at: now });
    }
    return { notifications, state };
}

function evaluateRule(
    rule: AlertRule,
    candidates: Candidate[],
    prev: AlertState,
    now: number,
    advisor: AdvisorSettings,
): { candidate: Candidate; title: string; body: string } | null {
    const tr = rule.trigger;
    switch (tr.type) {
        case "eta-threshold": {
            const c = candidates.find((x) => {
                if (x.eta > tr.minutes) return false;
                const before = prev.lastEta[etaKey(rule, x)];
                const crossed = before !== undefined && before > tr.minutes;
                return crossed || x.eta >= tr.minutes - CROSSING_TOLERANCE_MIN;
            });
            if (!c) return null;
            return {
                candidate: c,
                title: `${c.lineLabel} a ${c.eta === 0 ? "punto de llegar" : `${c.eta} min`}`,
                body: `${c.destination || c.lineLabel} · ${c.stopLabel}`,
            };
        }
        case "delay": {
            const c = candidates.find((x) => x.deviation !== null && x.deviation >= tr.minDelayMin);
            if (!c) return null;
            return {
                candidate: c,
                title: `${c.lineLabel}: demora estimada de ${c.deviation} min`,
                body: `Según el desvío horario informado. ${c.stopLabel} · llega en ${c.eta} min`,
            };
        }
        case "leave-home": {
            const rec = recommend(
                candidates.map((c) => ({ etaMinutes: c.eta, vehicleId: c.vehicleId })),
                tr.walkMin,
                now,
                { ...advisor, safetyMarginMin: tr.marginMin },
            );
            if (rec.kind !== "leave-now" && rec.kind !== "leave-in") return null;
            if (rec.leaveAt - now > tr.leadMin * 60_000) return null;
            const c = candidates.find((x) => x.eta === rec.busEta && x.vehicleId === rec.vehicleId) ?? candidates[0];
            return {
                candidate: c,
                title: `Salí ahora para el ${c.lineLabel}`,
                body: `Llega en ~${rec.busEta} min a ${c.stopLabel}; caminás ${tr.walkMin} min.`,
            };
        }
    }
}
