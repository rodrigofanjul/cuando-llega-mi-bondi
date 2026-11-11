/**
 * Qué filas muestra un widget en un instante dado. Puro y determinista: el
 * reloj se inyecta. Misma lógica que replican los widgets nativos.
 */
import type { NormalizedArrival } from "@features/arrivals/lib/normalize";
import { freshnessOf, projectEtaMinutes, type Freshness } from "@features/arrivals/lib/freshness";
import { arLocalParts, inWindow, parseHhMm, windowLength } from "@shared/time/argentina";

import type { SmartSlot, WidgetConfig, WidgetTarget } from "./config";

export interface QuerySnapshot {
    stopId: string;
    lineCode: string;
    fetchedAt: number;
    arrivals: NormalizedArrival[];
    /** La última consulta falló; `arrivals` puede ser de una consulta anterior. */
    error: string | null;
}

export type SnapshotIndex = Map<string, QuerySnapshot>;

export function snapshotKey(stopId: string, lineCode: string): string {
    return `${stopId}|${lineCode}`;
}

export function indexSnapshots(snapshots: QuerySnapshot[]): SnapshotIndex {
    return new Map(snapshots.map((s) => [snapshotKey(s.stopId, s.lineCode), s]));
}

export interface WidgetRow {
    target: WidgetTarget;
    /** Minutos proyectados a `now`; `null` si no hay dato confiable. */
    nextMinutes: number | null;
    secondMinutes: number | null;
    nextArriving: boolean;
    freshness: Freshness | "missing";
    updatedAt: number | null;
    note: string | null;
}

export type RowState = "ok" | "no-service" | "missing" | "stale" | "error";

export function rowState(row: WidgetRow): RowState {
    if (row.freshness === "missing") return "missing";
    if (row.freshness === "stale") return "stale";
    if (row.note && row.nextMinutes === null) return "error";
    if (row.nextMinutes === null) return "no-service";
    return "ok";
}

function matchesDestination(a: NormalizedArrival, t: WidgetTarget): boolean {
    if (!t.destination) return true;
    return a.destination.trim().toUpperCase() === t.destination.trim().toUpperCase();
}

export function buildRow(target: WidgetTarget, index: SnapshotIndex, now: number): WidgetRow {
    const snap = index.get(snapshotKey(target.stopId, target.lineCode));
    if (!snap) {
        return {
            target,
            nextMinutes: null,
            secondMinutes: null,
            nextArriving: false,
            freshness: "missing",
            updatedAt: null,
            note: null,
        };
    }
    const freshness = freshnessOf(snap.fetchedAt, now);
    // Sólo arribos de esta parada y esta línea: nunca se mezclan paradas
    // físicas distintas aunque compartan línea o nombre.
    const projected = snap.arrivals
        .filter((a) => a.stopId === target.stopId && a.lineCode === target.lineCode)
        .filter((a) => matchesDestination(a, target))
        .map((a) => ({ a, min: projectEtaMinutes(a.etaMinutes, snap.fetchedAt, now) }))
        .filter((x): x is { a: NormalizedArrival; min: number } => x.min !== null)
        .sort((x, y) => x.min - y.min);

    const apiError = snap.arrivals.find((a) => a.errorMessage)?.errorMessage ?? null;
    return {
        target,
        nextMinutes: projected[0]?.min ?? null,
        secondMinutes: projected[1]?.min ?? null,
        nextArriving: projected[0]?.a.status === "arriving" && projected[0].min === 0,
        freshness,
        updatedAt: snap.fetchedAt,
        note: snap.error ?? apiError,
    };
}

/** Orden multilínea: cronológico por próximo arribo; sin dato al final, estable. */
export function sortRows(rows: WidgetRow[]): WidgetRow[] {
    return rows
        .map((row, i) => ({ row, i }))
        .sort((x, y) => {
            const a = x.row.nextMinutes;
            const b = y.row.nextMinutes;
            if (a === null && b === null) return x.i - y.i;
            if (a === null) return 1;
            if (b === null) return -1;
            return a - b || x.i - y.i;
        })
        .map((x) => x.row);
}

/**
 * Franja activa del widget inteligente. Si se solapan varias, gana la más
 * corta (más específica); a igual longitud, la primera declarada.
 */
export function activeSmartSlot(slots: SmartSlot[], now: number): SmartSlot | null {
    const { weekday, minuteOfDay } = arLocalParts(now);
    let best: { slot: SmartSlot; len: number } | null = null;
    for (const slot of slots) {
        const from = parseHhMm(slot.from);
        const to = parseHhMm(slot.to);
        if (from === null || to === null) continue;
        // Franja que cruzó medianoche: la parte posterior pertenece al día anterior.
        const crossed = from > to && minuteOfDay < to;
        const day = crossed ? (weekday + 6) % 7 : weekday;
        if (!slot.days.includes(day) || !inWindow(minuteOfDay, from, to)) continue;
        const len = windowLength(from, to);
        if (!best || len < best.len) best = { slot, len };
    }
    return best?.slot ?? null;
}

export interface WidgetView {
    configId: string;
    title: string;
    rows: WidgetRow[];
    /** Etiqueta del lugar en widgets inteligentes. */
    context: string | null;
    oldestUpdate: number | null;
}

export function resolveWidgetView(config: WidgetConfig, index: SnapshotIndex, now: number): WidgetView {
    let targets: WidgetTarget[];
    let context: string | null = null;
    if (config.kind === "smart") {
        const slot = activeSmartSlot(config.slots, now);
        targets = slot ? slot.targets : config.fallbackTargets;
        context = slot ? slot.label : null;
    } else {
        targets = config.targets;
    }

    const built = targets.map((t) => buildRow(t, index, now));
    const rows = (config.kind === "single" ? built : sortRows(built)).slice(0, config.display.maxRows);
    const updates = rows.map((r) => r.updatedAt).filter((u): u is number => u !== null);
    return {
        configId: config.id,
        title: config.name,
        rows,
        context,
        oldestUpdate: updates.length ? Math.min(...updates) : null,
    };
}
