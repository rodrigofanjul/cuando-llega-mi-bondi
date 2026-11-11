/**
 * Motor de predicción OFFLINE (Fase 9, versión estadística). Funciona sin
 * servidor ni Internet: sólo perfil local + reloj + calendario.
 *
 * Paridad con ml/bondi_ml/profiles.py (fixture __fixtures__/profiles-synthetic.json).
 * Estados (§24): ONLINE · OFFLINE CON MODELO · OFFLINE SIN DATOS SUFICIENTES.
 * Nunca presenta una estimación histórica como arribo en vivo ni inventa minutos.
 */
import { z } from "zod";

import { arLocalParts } from "@shared/time/argentina";

const binSchema = z.object({
    bin: z.number().int().min(0).max(95),
    n: z.number().int().min(1),
    days: z.number().int().min(1),
    p10: z.number().min(0),
    p50: z.number().min(0),
    p90: z.number().min(0),
});

export const profileArtifactSchema = z.object({
    schema_version: z.literal(1),
    profile_version: z.string().min(1).max(60),
    generated_at: z.string(),
    data_source: z.string(),
    calendar_version: z.string(),
    bin_minutes: z.literal(15),
    entries: z.record(z.string(), z.record(z.enum(["weekday", "saturday", "sunday_holiday"]), z.array(binSchema))),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ProfileArtifact = z.infer<typeof profileArtifactSchema>;

/** Feriados nacionales inamovibles (mismo listado que ml/bondi_ml/calendar.py). */
const FIXED_HOLIDAYS = new Set(["01-01", "03-24", "04-02", "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"]);

export function offlineDayType(epochMs: number): "weekday" | "saturday" | "sunday_holiday" {
    const { weekday, date } = arLocalParts(epochMs);
    if (weekday === 0 || FIXED_HOLIDAYS.has(date.slice(5))) return "sunday_holiday";
    return weekday === 6 ? "saturday" : "weekday";
}

/** JSON canónico (claves ordenadas, sin espacios): igual que json.dumps(sort_keys=True, separators=(",", ":")). */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        const keys = Object.keys(value as Record<string, unknown>).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

export async function sha256Hex(text: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checksumOf(entries: ProfileArtifact["entries"]): Promise<string> {
    return sha256Hex(canonicalJson(entries));
}

export interface OfflineEstimate {
    waitMedianMin: number;
    waitLowMin: number;
    waitHighMin: number;
    /** Días e intervalos observados que respaldan la franja (calidad). */
    days: number;
    samples: number;
}

/** Igual a profiles.estimate (Python): franja exacta y luego vecinas. */
export function estimateOffline(profile: ProfileArtifact, stopId: string, lineCode: string, now: number): OfflineEstimate | null {
    const bins = profile.entries[`${stopId}|${lineCode}`]?.[offlineDayType(now)] ?? [];
    const b = Math.floor(arLocalParts(now).minuteOfDay / profile.bin_minutes);
    for (const candidate of [b, b - 1, b + 1]) {
        const hit = bins.find((x) => x.bin === candidate);
        if (hit) {
            return { waitMedianMin: Math.round(hit.p50 / 2), waitLowMin: 0, waitHighMin: Math.round(hit.p90), days: hit.days, samples: hit.n };
        }
    }
    return null;
}

/** Frecuencias publicadas (GTFS del proyecto, no oficiales): headway por línea y franja. */
export type FrequencyBaseline = Record<string, { start: number; end: number; headwayMin: number }[]>;

export function scheduledHeadway(freqs: FrequencyBaseline | null, lineLabel: string, now: number): number | null {
    const minute = arLocalParts(now).minuteOfDay;
    const w = freqs?.[lineLabel]?.find((x) => minute >= x.start && minute < x.end);
    return w ? w.headwayMin : null;
}

export type OfflineState =
    | { state: "ONLINE" }
    | { state: "OFFLINE_MODEL"; estimate: OfflineEstimate; syncedAt: string; label: string }
    | { state: "OFFLINE_INSUFFICIENT"; scheduledHeadwayMin: number | null; syncedAt: string | null; label: string };

export function resolveOfflineState(input: {
    online: boolean;
    profile: ProfileArtifact | null;
    freqs: FrequencyBaseline | null;
    stopId: string;
    lineCode: string;
    lineLabel: string;
    now: number;
}): OfflineState {
    if (input.online) return { state: "ONLINE" };
    const est = input.profile ? estimateOffline(input.profile, input.stopId, input.lineCode, input.now) : null;
    if (est && input.profile) {
        return {
            state: "OFFLINE_MODEL",
            estimate: est,
            syncedAt: input.profile.generated_at,
            label: "Estimación histórica — sin seguimiento GPS en tiempo real",
        };
    }
    const headway = scheduledHeadway(input.freqs, input.lineLabel, input.now);
    return {
        state: "OFFLINE_INSUFFICIENT",
        scheduledHeadwayMin: headway,
        syncedAt: input.profile?.generated_at ?? null,
        label: "Sin conexión: no hay datos suficientes para estimar la llegada",
    };
}

export interface ProfileStoreState {
    current: ProfileArtifact | null;
    previous: ProfileArtifact | null;
    lastError: string | null;
}

/**
 * Acepta una versión nueva sólo si valida esquema y checksum; si no, conserva la
 * actual (y la anterior) intacta. Nunca deja al usuario sin la última versión buena.
 */
export async function acceptProfile(state: ProfileStoreState, incoming: unknown): Promise<ProfileStoreState> {
    const parsed = profileArtifactSchema.safeParse(incoming);
    if (!parsed.success) return { ...state, lastError: "Perfil inválido o versión no soportada" };
    if ((await checksumOf(parsed.data.entries)) !== parsed.data.sha256) return { ...state, lastError: "Checksum no coincide" };
    if (state.current && state.current.sha256 === parsed.data.sha256) return { ...state, lastError: null };
    return { current: parsed.data, previous: state.current, lastError: null };
}

/** Subconjunto para pares de favoritos/widgets (menos almacenamiento y datos); recalcula el checksum. */
export async function subsetProfile(profile: ProfileArtifact, pairs: { stopId: string; lineCode: string }[]): Promise<ProfileArtifact> {
    const wanted = new Set(pairs.map((p) => `${p.stopId}|${p.lineCode}`));
    const entries = Object.fromEntries(Object.entries(profile.entries).filter(([k]) => wanted.has(k)));
    return { ...profile, entries, sha256: await checksumOf(entries) };
}
