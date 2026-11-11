/**
 * Ciclo del ejecutor local de alertas (app abierta). Consulta sólo los pares
 * (parada, línea) de reglas activas en este momento, normaliza, evalúa y
 * notifica. Las dependencias se inyectan: en producción `fetchArribos` usa el
 * cliente existente (`postWithMeta`), sin tocar la conexión de datos.
 *
 * Límite conocido: con la app cerrada no hay ejecución (Android/iOS no
 * garantizan tareas periódicas exactas). Las alertas exactas en segundo plano
 * requieren push desde servidor (T3.3, blocker B3) — la UI lo informa.
 */
import type { Arribo } from "@features/arrivals/types";
import { normalizeArribo } from "@features/arrivals/lib/normalize";
import { indexSnapshots, type QuerySnapshot } from "@features/widgets/lib/rows";

import { evaluateAlerts, isExpired, isScheduleActive, type AlertNotification, type AlertRule, type AlertState } from "./engine";

export interface RunnerDeps {
    now: () => number;
    fetchArribos: (stopId: string, lineCode: string) => Promise<{ arribos: Arribo[]; stale: boolean }>;
    notify: (n: AlertNotification) => Promise<boolean>;
}

export interface CycleResult {
    state: AlertState;
    notified: AlertNotification[];
    /** Notificaciones que el sistema no dejó mostrar (sin permiso). */
    undelivered: AlertNotification[];
    queried: number;
    errors: number;
    expiredRuleIds: string[];
}

/** Tope de consultas por ciclo: protege al proveedor si alguien carga muchas reglas. */
export const MAX_QUERIES_PER_CYCLE = 8;

export function activeQueries(rules: AlertRule[], now: number): { stopId: string; lineCode: string }[] {
    const seen = new Map<string, { stopId: string; lineCode: string }>();
    for (const r of rules) {
        if (!r.enabled || !isScheduleActive(r, now)) continue;
        for (const t of r.targets) seen.set(`${t.stopId}|${t.lineCode}`, { stopId: t.stopId, lineCode: t.lineCode });
    }
    return [...seen.values()].slice(0, MAX_QUERIES_PER_CYCLE);
}

export async function runAlertCycle(rules: AlertRule[], state: AlertState, deps: RunnerDeps): Promise<CycleResult> {
    const now = deps.now();
    const expiredRuleIds = rules.filter((r) => isExpired(r, now)).map((r) => r.id);
    const live = rules.filter((r) => !expiredRuleIds.includes(r.id));
    const queries = activeQueries(live, now);

    let errors = 0;
    const snapshots: QuerySnapshot[] = [];
    await Promise.all(
        queries.map(async (q) => {
            try {
                const { arribos, stale } = await deps.fetchArribos(q.stopId, q.lineCode);
                // Un dato STALE del proxy tiene antigüedad desconocida: no dispara alertas.
                if (stale) return;
                snapshots.push({
                    stopId: q.stopId,
                    lineCode: q.lineCode,
                    fetchedAt: now,
                    error: null,
                    arrivals: arribos.map((a) => normalizeArribo(a, { stopId: q.stopId, lineCode: q.lineCode, fetchedAt: now })),
                });
            } catch {
                errors++;
            }
        }),
    );

    const evaluated = evaluateAlerts(live, indexSnapshots(snapshots), state, now);
    const notified: AlertNotification[] = [];
    const undelivered: AlertNotification[] = [];
    const nextState = { ...evaluated.state, fired: { ...evaluated.state.fired } };
    for (const n of evaluated.notifications) {
        let ok = false;
        try {
            ok = await deps.notify(n);
        } catch {
            ok = false;
        }
        if (ok) {
            notified.push(n);
        } else {
            // No marcar como enviada: se reintenta en el próximo ciclo si sigue aplicando.
            delete nextState.fired[n.dedupeKey];
            undelivered.push(n);
        }
    }
    return { state: nextState, notified, undelivered, queried: queries.length, errors, expiredRuleIds };
}
