/**
 * Detección de demoras y anomalías por reglas estadísticas (Fase 6, §9).
 *
 * Niveles de evidencia (siempre explícitos en la UI):
 * - `demora_confirmada`: una llegada inferida con confianza ALTA ocurrió ≥ N min
 *   después de lo que predecía el último ETA oficial.
 * - `demora_estimada`: el proveedor informa desvío horario positivo ≥ N min.
 * - `anomalia_detectada`: patrón inusual en la serie (salto de ETA, GPS sin
 *   actualizar, ETA estancado, intervalo anormal entre unidades).
 * - `datos_insuficientes`: no hay serie suficiente para afirmar nada.
 *
 * Nunca se atribuyen causas (tránsito, accidentes, etc.): los textos describen
 * lo observado. Isolation Forest u otros modelos se evaluarán con histórico real.
 */
import type { NormalizedArrival } from "@features/arrivals/lib/normalize";
import type { InferredArrival } from "@features/observations/lib/inferArrivals";

export type EvidenceLevel = "demora_confirmada" | "demora_estimada" | "anomalia_detectada" | "datos_insuficientes";

export type SignalKind =
    | "official_delay"
    | "confirmed_delay"
    | "eta_jump"
    | "gps_frozen"
    | "eta_stalled"
    | "headway_gap"
    | "insufficient_data";

export interface AnomalySignal {
    kind: SignalKind;
    level: EvidenceLevel;
    vehicleId: string | null;
    /** Magnitud en minutos (demora, salto, intervalo, tiempo congelado). */
    minutes: number;
    detectedAt: number;
    message: string;
}

/** Una consulta de arribos de una (parada, línea) en un instante. */
export interface SeriesPoint {
    at: number;
    arrivals: NormalizedArrival[];
}

export interface DetectOptions {
    delayMin: number;
    jumpMin: number;
    gpsFrozenMin: number;
    stalledMin: number;
    /** Intervalo esperado entre unidades (del histórico); sin él, regla relativa. */
    expectedHeadwayMin: number | null;
    minPointsForSeries: number;
}

export const DEFAULT_DETECT: DetectOptions = {
    delayMin: 5,
    jumpMin: 5,
    gpsFrozenMin: 6,
    stalledMin: 6,
    expectedHeadwayMin: null,
    minPointsForSeries: 3,
};

const MIN = 60_000;

function byVehicle(series: SeriesPoint[]): Map<string, { at: number; a: NormalizedArrival }[]> {
    const map = new Map<string, { at: number; a: NormalizedArrival }[]>();
    for (const p of series) {
        for (const a of p.arrivals) {
            if (!a.vehicleId) continue;
            const list = map.get(a.vehicleId) ?? [];
            list.push({ at: p.at, a });
            map.set(a.vehicleId, list);
        }
    }
    return map;
}

/** Desvío oficial informado por el proveedor (último punto). */
function officialDelays(last: SeriesPoint, o: DetectOptions): AnomalySignal[] {
    return last.arrivals
        .filter((a) => a.deviationMinutes !== null && a.deviationMinutes >= o.delayMin)
        .map((a) => ({
            kind: "official_delay" as const,
            level: "demora_estimada" as const,
            vehicleId: a.vehicleId,
            minutes: a.deviationMinutes!,
            detectedAt: last.at,
            message: `Demora estimada de ${a.deviationMinutes} min según el desvío horario informado.`,
        }));
}

/**
 * Salto de ETA de una misma unidad entre consultas consecutivas: el ETA sube
 * (o baja) bastante más de lo que explica el tiempo transcurrido.
 */
function etaJumps(series: SeriesPoint[], o: DetectOptions): AnomalySignal[] {
    const out: AnomalySignal[] = [];
    for (const [vehicleId, pts] of byVehicle(series)) {
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const cur = pts[i];
            if (prev.a.etaMinutes === null || cur.a.etaMinutes === null) continue;
            const elapsed = (cur.at - prev.at) / MIN;
            if (elapsed > 10) continue; // demasiado separadas para comparar
            const expected = prev.a.etaMinutes - elapsed;
            const delta = cur.a.etaMinutes - expected;
            if (Math.abs(delta) >= o.jumpMin) {
                out.push({
                    kind: "eta_jump",
                    level: "anomalia_detectada",
                    vehicleId,
                    minutes: Math.round(delta),
                    detectedAt: cur.at,
                    message:
                        delta > 0
                            ? `El tiempo estimado de la unidad ${vehicleId} aumentó ${Math.round(delta)} min de golpe.`
                            : `El tiempo estimado de la unidad ${vehicleId} bajó ${Math.round(-delta)} min de golpe.`,
                });
            }
        }
    }
    return out;
}

/** La última posición GPS informada no avanza mientras la unidad sigue listada. */
function gpsFrozen(series: SeriesPoint[], o: DetectOptions): AnomalySignal[] {
    const out: AnomalySignal[] = [];
    const last = series.at(-1)!;
    for (const a of last.arrivals) {
        if (!a.vehicleId || a.gpsAt === null) continue;
        const ageMin = (last.at - a.gpsAt) / MIN;
        if (ageMin >= o.gpsFrozenMin) {
            out.push({
                kind: "gps_frozen",
                level: "anomalia_detectada",
                vehicleId: a.vehicleId,
                minutes: Math.floor(ageMin),
                detectedAt: last.at,
                message: `La unidad ${a.vehicleId} no actualiza su posición hace ${Math.floor(ageMin)} min; el tiempo estimado puede no ser confiable.`,
            });
        }
    }
    return out;
}

/** El ETA de una unidad no baja durante varios minutos (posible unidad detenida). */
function etaStalled(series: SeriesPoint[], o: DetectOptions): AnomalySignal[] {
    const out: AnomalySignal[] = [];
    for (const [vehicleId, pts] of byVehicle(series)) {
        const last = pts.at(-1)!;
        if (last.a.etaMinutes === null || last.a.status === "arriving") continue;
        // Desde cuándo el ETA es ≥ al actual (no bajó).
        let since = last.at;
        for (let i = pts.length - 2; i >= 0; i--) {
            const eta = pts[i].a.etaMinutes;
            if (eta === null || eta > last.a.etaMinutes) break;
            since = pts[i].at;
        }
        const stalledMin = (last.at - since) / MIN;
        if (stalledMin >= o.stalledMin) {
            out.push({
                kind: "eta_stalled",
                level: "anomalia_detectada",
                vehicleId,
                minutes: Math.floor(stalledMin),
                detectedAt: last.at,
                message: `El tiempo estimado de la unidad ${vehicleId} no baja hace ${Math.floor(stalledMin)} min. Podría estar detenida.`,
            });
        }
    }
    return out;
}

/** Intervalo anormal entre unidades consecutivas (en el último punto). */
function headwayGaps(last: SeriesPoint, o: DetectOptions): AnomalySignal[] {
    const etas = last.arrivals
        .map((a) => a.etaMinutes)
        .filter((e): e is number => e !== null)
        .sort((a, b) => a - b);
    if (etas.length < 2) return [];
    const gaps = etas.slice(1).map((e, i) => e - etas[i]);
    const out: AnomalySignal[] = [];
    gaps.forEach((gap, i) => {
        let threshold: number;
        if (o.expectedHeadwayMin !== null) {
            threshold = Math.max(15, o.expectedHeadwayMin * 2);
        } else {
            // Sin histórico: anómalo si es ≥ 3× la mediana del resto y ≥ 25 min.
            const others = gaps.filter((_, j) => j !== i).sort((a, b) => a - b);
            if (others.length === 0) return;
            const median = others[Math.floor(others.length / 2)];
            threshold = Math.max(25, median * 3);
        }
        if (gap >= threshold) {
            out.push({
                kind: "headway_gap",
                level: "anomalia_detectada",
                vehicleId: null,
                minutes: gap,
                detectedAt: last.at,
                message: `Hay un intervalo inusual de ${gap} min entre dos colectivos.`,
            });
        }
    });
    return out;
}

/**
 * Demoras confirmadas a partir de llegadas inferidas: sólo confianza alta y
 * llegada ≥ `delayMin` después de lo que predecía el último ETA oficial.
 */
export function confirmedDelays(arrivals: InferredArrival[], o: DetectOptions = DEFAULT_DETECT): AnomalySignal[] {
    return arrivals
        .filter((x) => x.confidence === "high" && x.lastOfficialEtaMinutes !== null && x.lastOfficialEtaAt !== null)
        .map((x) => ({ x, late: (x.arrivedAt - (x.lastOfficialEtaAt! + x.lastOfficialEtaMinutes! * MIN)) / MIN }))
        .filter(({ late }) => late >= o.delayMin)
        .map(({ x, late }) => ({
            kind: "confirmed_delay" as const,
            level: "demora_confirmada" as const,
            vehicleId: x.vehicleId,
            minutes: Math.round(late),
            detectedAt: x.arrivedAt,
            message: `La unidad ${x.vehicleId} llegó ${Math.round(late)} min más tarde de lo estimado.`,
        }));
}

export function detectAnomalies(series: SeriesPoint[], options: Partial<DetectOptions> = {}): AnomalySignal[] {
    const o = { ...DEFAULT_DETECT, ...options };
    const sorted = [...series].sort((a, b) => a.at - b.at);
    const last = sorted.at(-1);
    if (!last) {
        return [{ kind: "insufficient_data", level: "datos_insuficientes", vehicleId: null, minutes: 0, detectedAt: 0, message: "Sin datos para analizar." }];
    }
    const signals: AnomalySignal[] = [...officialDelays(last, o), ...headwayGaps(last, o), ...gpsFrozen(sorted, o)];
    if (sorted.length >= o.minPointsForSeries) {
        signals.push(...etaJumps(sorted, o), ...etaStalled(sorted, o));
    } else if (signals.length === 0) {
        signals.push({
            kind: "insufficient_data",
            level: "datos_insuficientes",
            vehicleId: null,
            minutes: 0,
            detectedAt: last.at,
            message: "Todavía no hay suficientes consultas para detectar anomalías.",
        });
    }
    return signals;
}

const LEVEL_RANK: Record<EvidenceLevel, number> = {
    demora_confirmada: 3,
    demora_estimada: 2,
    anomalia_detectada: 1,
    datos_insuficientes: 0,
};

/** La señal más relevante para mostrar (mayor evidencia, luego mayor magnitud). */
export function mostRelevant(signals: AnomalySignal[]): AnomalySignal | null {
    const useful = signals.filter((s) => s.level !== "datos_insuficientes");
    if (useful.length === 0) return null;
    return [...useful].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || Math.abs(b.minutes) - Math.abs(a.minutes))[0];
}

export const LEVEL_LABEL: Record<EvidenceLevel, string> = {
    demora_confirmada: "Demora confirmada",
    demora_estimada: "Demora estimada",
    anomalia_detectada: "Anomalía detectada",
    datos_insuficientes: "Datos insuficientes",
};
