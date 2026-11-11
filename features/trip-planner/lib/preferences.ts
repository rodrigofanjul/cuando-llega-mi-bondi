/**
 * Preferencias y horarios sobre los itinerarios del planner RAPTOR existente
 * (no lo reemplaza: re-ordena y agrega horarios). Puro y determinista.
 *
 * Los tiempos son ESTIMADOS con el modelo de costos del planner (espera media
 * incluida en BOARDING_OVERHEAD_MINS). Si se conoce el arribo en vivo del primer
 * colectivo, se usa para la primera espera.
 */
import type { Itinerary, RouteLegRide } from "../types";
import { WALK_METERS_PER_MIN, estimateLegMins, estimateMins, itineraryRankCost } from "./costModel";

export type TripPreference = "fastest" | "least_walk" | "fewest_transfers";

export interface PreferenceOptions {
    preference: TripPreference;
    /** Códigos de línea preferidos (bonificación, no exclusión). */
    preferredLines?: string[];
}

const PREFERRED_LINE_BONUS_MIN = 3;

function rides(it: Itinerary): RouteLegRide[] {
    return it.legs.filter((l): l is RouteLegRide => l.kind === "ride");
}

export function preferenceCost(it: Itinerary, o: PreferenceOptions): number {
    const base = itineraryRankCost(it);
    const walkMin = it.totalWalkMeters / WALK_METERS_PER_MIN;
    const transfers = Math.max(0, it.totalRides - 1);
    let cost = base;
    if (o.preference === "least_walk") cost += walkMin * 1.5;
    if (o.preference === "fewest_transfers") cost += transfers * 15;
    const preferred = new Set(o.preferredLines ?? []);
    if (preferred.size > 0) cost -= rides(it).filter((r) => preferred.has(r.codLinea)).length * PREFERRED_LINE_BONUS_MIN;
    return cost;
}

/** Orden estable por preferencia (a igual costo se respeta el orden del planner). */
export function rankByPreference(itineraries: Itinerary[], o: PreferenceOptions): Itinerary[] {
    return itineraries
        .map((it, i) => ({ it, i, c: preferenceCost(it, o) }))
        .sort((a, b) => a.c - b.c || a.i - b.i)
        .map((x) => x.it);
}

export type TimeMode = { type: "now" } | { type: "depart_at"; at: number } | { type: "arrive_by"; at: number };

export interface ScheduledItinerary {
    itinerary: Itinerary;
    departAt: number;
    arriveAt: number;
    totalMinutes: number;
    /** `live` si la primera espera usa el arribo en vivo; `estimated` si es la media del modelo. */
    firstWait: "live" | "estimated" | "none";
    /** Hay que salir antes de `now` para llegar a tiempo (modo «llegar antes de»). */
    tooLate: boolean;
}

const MIN = 60_000;

/**
 * Horario de un itinerario.
 * - `now` / `depart_at`: sale a esa hora; llega sumando la duración.
 * - `arrive_by`: sale lo más tarde posible para llegar a esa hora.
 * `liveFirstEtaMin`: minutos (desde `now`) hasta que pasa el primer colectivo.
 */
export function scheduleItinerary(it: Itinerary, mode: TimeMode, now: number, liveFirstEtaMin: number | null = null): ScheduledItinerary {
    const legMins = estimateLegMins(it);
    const total = estimateMins(it.totalWalkMeters, it.totalRideMeters, it.totalRides);
    const firstRideIdx = it.legs.findIndex((l) => l.kind === "ride");

    if (firstRideIdx === -1) {
        const departAt = mode.type === "arrive_by" ? mode.at - total * MIN : mode.type === "depart_at" ? mode.at : now;
        return { itinerary: it, departAt, arriveAt: departAt + total * MIN, totalMinutes: total, firstWait: "none", tooLate: departAt < now };
    }

    if (mode.type === "now" && liveFirstEtaMin !== null) {
        // Caminata hasta la primera parada y espera real hasta que pase el colectivo.
        const walkBefore = legMins.slice(0, firstRideIdx).reduce((a, b) => a + b, 0);
        const boardAt = now + Math.max(liveFirstEtaMin, walkBefore) * MIN;
        // El tramo del primer colectivo ya incluye una espera media: se reemplaza por la real.
        const firstRideTravel = Math.max(1, legMins[firstRideIdx] - 4);
        const after = legMins.slice(firstRideIdx + 1).reduce((a, b) => a + b, 0);
        const arriveAt = boardAt + (firstRideTravel + after) * MIN;
        return {
            itinerary: it,
            departAt: boardAt - walkBefore * MIN,
            arriveAt,
            totalMinutes: Math.round((arriveAt - now) / MIN),
            firstWait: "live",
            tooLate: liveFirstEtaMin < walkBefore,
        };
    }

    const departAt = mode.type === "arrive_by" ? mode.at - total * MIN : mode.type === "depart_at" ? mode.at : now;
    return {
        itinerary: it,
        departAt,
        arriveAt: departAt + total * MIN,
        totalMinutes: total,
        firstWait: "estimated",
        tooLate: mode.type === "arrive_by" && departAt < now,
    };
}

/** En «llegar antes de», sólo los que todavía se pueden tomar, ordenados por salida más tardía. */
export function scheduleAll(itineraries: Itinerary[], mode: TimeMode, now: number): ScheduledItinerary[] {
    const scheduled = itineraries.map((it) => scheduleItinerary(it, mode, now));
    if (mode.type !== "arrive_by") return scheduled;
    return scheduled.filter((s) => !s.tooLate).sort((a, b) => b.departAt - a.departAt);
}

/** Índices ordenados (para reordenar en paralelo itinerarios y vistas de mapa) + horarios alineados. */
export function arrangeTrips(
    itineraries: Itinerary[],
    o: PreferenceOptions,
    mode: TimeMode,
    now: number,
): { order: number[]; schedules: ScheduledItinerary[] } {
    const ranked = rankByPreference(itineraries, o);
    let order = ranked.map((it) => itineraries.indexOf(it));
    let schedules = order.map((i) => scheduleItinerary(itineraries[i], mode, now));
    if (mode.type === "arrive_by") {
        const keep = schedules.map((s, k) => ({ s, i: order[k] })).filter((x) => !x.s.tooLate);
        order = keep.map((x) => x.i);
        schedules = keep.map((x) => x.s);
    }
    return { order, schedules };
}
