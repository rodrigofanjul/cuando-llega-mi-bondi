/**
 * Asistente «¿cuándo salgo?». Combina caminata hasta la parada, ETA del
 * colectivo, margen de seguridad y variabilidad de la predicción.
 *
 * Trabaja con hora absoluta de salida (`leaveAt`), no con "salí en N min":
 * así un ETA que fluctúa ±1 min no hace saltar la recomendación, y
 * `stabilize()` aplica histéresis asimétrica (adelantar la salida siempre se
 * comunica; atrasarla sólo si el cambio es grande).
 */
import { haversineMeters } from "@shared/geo/haversine";

export interface LatLng {
    lat: number;
    lng: number;
}

export interface AdvisorSettings {
    /** m/s; 1.25 ≈ 4.5 km/h. */
    walkSpeedMps: number;
    /** Línea recta → recorrido real por calles. */
    detourFactor: number;
    safetyMarginMin: number;
}

export const DEFAULT_ADVISOR: AdvisorSettings = {
    walkSpeedMps: 1.25,
    detourFactor: 1.3,
    safetyMarginMin: 2,
};

export function walkMinutes(origin: LatLng, stop: LatLng, s: AdvisorSettings = DEFAULT_ADVISOR): number {
    const meters = haversineMeters(origin.lat, origin.lng, stop.lat, stop.lng) * s.detourFactor;
    return Math.ceil(meters / s.walkSpeedMps / 60);
}

/**
 * Incertidumbre del ETA oficial cuando no hay modelo calibrado: crece con el
 * horizonte (predicciones lejanas son menos confiables). Si existe un
 * intervalo del modelo publicado, usar ese valor en su lugar.
 */
export function defaultEtaUncertainty(etaMinutes: number): number {
    return Math.max(1, Math.round(etaMinutes * 0.15));
}

export interface CandidateBus {
    /** Minutos hasta el arribo, ya proyectados a `now`. */
    etaMinutes: number;
    /** Identidad aproximada del colectivo (para histéresis); `null` si se desconoce. */
    vehicleId: string | null;
    /** ± minutos; `undefined` → `defaultEtaUncertainty`. */
    uncertaintyMin?: number;
}

export type Recommendation =
    | {
          kind: "leave-in" | "leave-now";
          leaveAt: number;
          busEta: number;
          walkMin: number;
          bufferMin: number;
          vehicleId: string | null;
          skippedBuses: number;
          computedAt: number;
      }
    | { kind: "no-catchable-bus"; walkMin: number }
    | { kind: "no-data" };

export function recommend(
    buses: CandidateBus[],
    walkMin: number,
    now: number,
    s: AdvisorSettings = DEFAULT_ADVISOR,
): Recommendation {
    if (buses.length === 0) return { kind: "no-data" };
    const sorted = [...buses].sort((a, b) => a.etaMinutes - b.etaMinutes);
    for (let i = 0; i < sorted.length; i++) {
        const bus = sorted[i];
        const uncertainty = bus.uncertaintyMin ?? defaultEtaUncertainty(bus.etaMinutes);
        const buffer = s.safetyMarginMin + uncertainty;
        const slackMin = bus.etaMinutes - walkMin - buffer;
        // Si ni saliendo ya llegás con el margen, se pasa al siguiente.
        if (slackMin < 0) continue;
        return {
            kind: slackMin < 1 ? "leave-now" : "leave-in",
            leaveAt: now + Math.floor(slackMin) * 60_000,
            busEta: bus.etaMinutes,
            walkMin,
            bufferMin: buffer,
            vehicleId: bus.vehicleId,
            skippedBuses: i,
            computedAt: now,
        };
    }
    return { kind: "no-catchable-bus", walkMin };
}

export interface StabilizeOptions {
    /** Adelantar la salida al menos esto para comunicarlo (ms). */
    earlierThresholdMs: number;
    /** Atrasar la salida al menos esto para comunicarlo (ms). */
    laterThresholdMs: number;
}

export const DEFAULT_STABILIZE: StabilizeOptions = {
    earlierThresholdMs: 60_000,
    laterThresholdMs: 3 * 60_000,
};

/**
 * Evita instrucciones contradictorias: mientras se sigue apuntando al mismo
 * colectivo, una nueva hora de salida sólo reemplaza a la anterior si el
 * cambio supera el umbral. Cambiar de colectivo objetivo siempre se comunica.
 */
export function stabilize(
    prev: Recommendation | null,
    next: Recommendation,
    now: number,
    o: StabilizeOptions = DEFAULT_STABILIZE,
): Recommendation {
    if (!prev || prev.kind === "no-data" || prev.kind === "no-catchable-bus") return next;
    if (next.kind === "no-data" || next.kind === "no-catchable-bus") return next;

    const sameBus = prev.vehicleId !== null && prev.vehicleId === next.vehicleId;
    // Sin id de unidad: misma "posición" en la cola y ETA coherente con el tiempo transcurrido.
    const elapsedMin = (now - prev.computedAt) / 60_000;
    const plausiblySame =
        prev.vehicleId === null &&
        next.vehicleId === null &&
        prev.skippedBuses === next.skippedBuses &&
        Math.abs(prev.busEta - elapsedMin - next.busEta) <= 3;
    if (!sameBus && !plausiblySame) return next;

    const delta = next.leaveAt - prev.leaveAt;
    if (delta <= -o.earlierThresholdMs || delta >= o.laterThresholdMs) return next;

    // Se conserva sólo la hora de salida comunicada; ETA y demás se actualizan.
    const kind = prev.leaveAt - now < 60_000 ? "leave-now" : "leave-in";
    return { ...next, leaveAt: prev.leaveAt, kind };
}

/** Texto en castellano rioplatense para UI/notificación. */
export function describeRecommendation(r: Recommendation, now: number): string {
    switch (r.kind) {
        case "no-data":
            return "No hay arribos disponibles para calcular cuándo salir.";
        case "no-catchable-bus":
            return `Ningún colectivo informado te da tiempo: tardás ${r.walkMin} min caminando.`;
        case "leave-now":
            return `El colectivo llega en aproximadamente ${r.busEta} min. Tardás ${r.walkMin} min caminando. Te recomendamos salir ahora.`;
        case "leave-in": {
            const mins = Math.max(1, Math.round((r.leaveAt - now) / 60_000));
            return `El colectivo llega en aproximadamente ${r.busEta} min. Tardás ${r.walkMin} min caminando. Te recomendamos salir en ${mins} min.`;
        }
    }
}
