import { freshnessOf, projectEtaMinutes } from "@features/arrivals/lib/freshness";
import { formatArClock } from "@shared/time/argentina";

export type ArrivalInput =
    | { kind: "live"; etaMinutes: number | null; arriving: boolean; fetchedAt: number; now: number }
    | { kind: "historical"; medianMin: number; highMin: number }
    | { kind: "none"; headwayMin: number | null; fetchedAt?: number; now?: number };

export interface ArrivalView {
    state: "live" | "aging" | "stale" | "arriving" | "historical" | "none";
    text: string;
    note: string | null;
    spoken: string;
    pulse: boolean;
}

const minutes = (m: number) => (m === 1 ? "1 minuto" : `${m} minutos`);

/** Única regla de presentación de un arribo (spec §7). Nunca muestra viejo/estimado como en vivo. */
export function arrivalDisplay(input: ArrivalInput): ArrivalView {
    if (input.kind === "historical") {
        return {
            state: "historical",
            text: `≈ ${input.medianMin} min`,
            note: `histórico · hasta ${input.highMin}`,
            spoken: `estimación histórica, alrededor de ${minutes(input.medianMin)}`,
            pulse: false,
        };
    }
    if (input.kind === "none") {
        const headway = input.headwayMin !== null ? `pasa cada ~${input.headwayMin} min` : null;
        // Un "sin arribos" consultado hace rato no debe leerse como actual.
        let age: string | null = null;
        if (input.fetchedAt !== undefined && input.now !== undefined) {
            const f = freshnessOf(input.fetchedAt, input.now);
            if (f === "stale") age = `Dato de las ${formatArClock(input.fetchedAt)}`;
            else if (f === "aging") age = `hace ${Math.max(0, Math.floor((input.now - input.fetchedAt) / 60_000))} min`;
        }
        return {
            state: "none",
            text: "Sin arribos ahora",
            note: [age, headway].filter(Boolean).join(" · ") || null,
            spoken: "sin arribos informados ahora",
            pulse: false,
        };
    }
    const freshness = freshnessOf(input.fetchedAt, input.now);
    if (freshness === "stale") {
        const clock = formatArClock(input.fetchedAt);
        return { state: "stale", text: `Dato de las ${clock}`, note: null, spoken: `dato vencido de las ${clock}`, pulse: false };
    }
    const eta = projectEtaMinutes(input.etaMinutes, input.fetchedAt, input.now);
    const ageMin = Math.max(0, Math.floor((input.now - input.fetchedAt) / 60_000));
    const note = freshness === "aging" ? `hace ${ageMin} min` : null;
    if (input.arriving && (eta === null || eta === 0)) {
        return { state: "arriving", text: "Llegando", note, spoken: "está llegando", pulse: freshness === "fresh" };
    }
    if (eta === null) {
        return { state: "none", text: "Sin arribos ahora", note, spoken: "sin arribos informados ahora", pulse: false };
    }
    return {
        state: freshness === "fresh" ? "live" : "aging",
        text: eta === 0 ? "< 1 min" : `${eta} min`,
        note,
        spoken: eta === 0 ? "llega en menos de un minuto" : `llega en ${minutes(eta)}`,
        pulse: freshness === "fresh",
    };
}
