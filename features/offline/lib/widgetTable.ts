/**
 * Tabla offline para widgets nativos (contrato `offline_v1`). La web la arma a
 * partir del perfil validado; Kotlin (OfflineTable.kt) y Swift
 * (OfflineTable.swift) sólo hacen una búsqueda por día local y franja de 15 min,
 * sin calendario ni redondeos propios: así no hay tres motores que mantener.
 *
 * El tipo de día de los próximos `OFFLINE_HORIZON_DAYS` días viene resuelto
 * (feriados incluidos). Pasado el horizonte el widget no estima: perfil viejo.
 * Paridad: shared/contracts/offline-vectors.json.
 */
import { arLocalParts } from "@shared/time/argentina";

import { estimateOffline, offlineDayType, type ProfileArtifact } from "./profiles";

export const OFFLINE_TABLE_VERSION = 1 as const;
export const OFFLINE_HORIZON_DAYS = 14;

const AR_OFFSET_MS = -3 * 60 * 60_000;
const DAY_MS = 86_400_000;

export type DayType = "weekday" | "saturday" | "sunday_holiday";
/** [franja, mediana de espera, máximo probable, días observados] en minutos. */
export type TableBin = [number, number, number, number];

export interface OfflineWidgetTable {
    version: typeof OFFLINE_TABLE_VERSION;
    profileVersion: string;
    dataSource: string;
    generatedAt: string;
    syncedAt: number;
    binMinutes: 15;
    /** Día local de Mar del Plata contado desde 1970-01-01 (UTC−3). */
    firstDay: number;
    dayTypes: DayType[];
    entries: Record<string, Partial<Record<DayType, TableBin[]>>>;
}

export interface OfflineHint {
    medianMin: number;
    highMin: number;
    days: number;
}

export function arDayIndex(epochMs: number): number {
    return Math.floor((epochMs + AR_OFFSET_MS) / DAY_MS);
}

export function buildOfflineWidgetTable(
    profile: ProfileArtifact,
    pairs: { stopId: string; lineCode: string }[],
    syncedAt: number,
    now: number,
): OfflineWidgetTable {
    const firstDay = arDayIndex(now);
    const dayTypes = Array.from({ length: OFFLINE_HORIZON_DAYS }, (_, i) =>
        // Mediodía local del día i: lejos de cualquier borde de medianoche.
        offlineDayType((firstDay + i) * DAY_MS - AR_OFFSET_MS + 12 * 60 * 60_000),
    );
    const entries: OfflineWidgetTable["entries"] = {};
    for (const { stopId, lineCode } of pairs) {
        const key = `${stopId}|${lineCode}`;
        const byType = profile.entries[key];
        if (!byType || entries[key]) continue;
        entries[key] = Object.fromEntries(
            Object.entries(byType).map(([type, bins]) => [
                type,
                bins.map((b): TableBin => [b.bin, Math.round(b.p50 / 2), Math.round(b.p90), b.days]),
            ]),
        );
    }
    return {
        version: OFFLINE_TABLE_VERSION,
        profileVersion: profile.profile_version,
        dataSource: profile.data_source,
        generatedAt: profile.generated_at,
        syncedAt,
        binMinutes: 15,
        firstDay,
        dayTypes,
        entries,
    };
}

/** Misma búsqueda que estimateOffline: franja exacta, luego anterior, luego siguiente. */
export function lookupOfflineTable(table: OfflineWidgetTable, stopId: string, lineCode: string, now: number): OfflineHint | null {
    const idx = arDayIndex(now) - table.firstDay;
    const type = table.dayTypes[idx];
    if (idx < 0 || !type) return null;
    const bins = table.entries[`${stopId}|${lineCode}`]?.[type] ?? [];
    const b = Math.floor(arLocalParts(now).minuteOfDay / table.binMinutes);
    for (const candidate of [b, b - 1, b + 1]) {
        const hit = bins.find((x) => x[0] === candidate);
        if (hit) return { medianMin: hit[1], highMin: hit[2], days: hit[3] };
    }
    return null;
}

/** Comprobación usada por los tests: la tabla responde igual que el motor web. */
export function matchesEngine(profile: ProfileArtifact, table: OfflineWidgetTable, stopId: string, lineCode: string, now: number): boolean {
    const a = estimateOffline(profile, stopId, lineCode, now);
    const b = lookupOfflineTable(table, stopId, lineCode, now);
    if (!a || !b) return a === null && b === null;
    return a.waitMedianMin === b.medianMin && a.waitHighMin === b.highMin && a.days === b.days;
}
