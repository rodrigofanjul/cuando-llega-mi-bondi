/**
 * Normalización pura de arribos MGP (`Arribo`, PascalCase crudo) a un modelo
 * estable que consumen widgets, alertas y el asistente «cuándo salir».
 *
 * Reglas: nunca inventar datos. Un formato no reconocido produce `null`, no un
 * número aproximado. El contrato está fijado por
 * `shared/contracts/arrival-vectors.json`, que también ejecutan los tests de
 * los widgets nativos (Kotlin/Swift).
 */
import type { Arribo } from "@features/arrivals/types";
import { arriboBanderaLabel, arriboLineaDescripcion } from "@features/arrivals/utils";

export type EtaStatus = "arriving" | "minutes" | "unknown";

export interface NormalizedArrival {
    stopId: string;
    /**
     * Línea **consultada** (`codigoLineaParada` del request). Se usa la del
     * request y no la del arribo porque la UI existente no asume que coincidan
     * como string (ver features/search/api/otrasLineas.ts).
     */
    lineCode: string;
    /** `CodigoLineaParada` tal como vino en el arribo. */
    rawLineCode: string;
    lineLabel: string;
    destination: string;
    rawEta: string;
    etaMinutes: number | null;
    status: EtaStatus;
    /** Positivo = atrasado, negativo = adelantado. */
    deviationMinutes: number | null;
    vehicleId: string | null;
    accessible: boolean;
    vehiclePosition: { lat: number; lng: number } | null;
    /** Epoch ms de la última posición GPS informada. */
    gpsAt: number | null;
    /** Epoch ms en que el cliente obtuvo el dato. */
    fetchedAt: number;
    errorMessage: string | null;
}

const ARRIVING_RE = /^(arribando|llegando)\b/i;
const HOURS_RE = /^(\d{1,2})\s*(?:h|hs|hora|horas)\b(?:\s*(\d{1,2})\s*min)?/i;
const MINUTES_RE = /^(\d{1,3})\s*min/i;

export function parseEtaMinutes(raw: string): { minutes: number | null; status: EtaStatus } {
    const text = (raw ?? "").trim();
    if (ARRIVING_RE.test(text)) return { minutes: 0, status: "arriving" };

    const h = HOURS_RE.exec(text);
    if (h) {
        const minutes = Number(h[1]) * 60 + (h[2] ? Number(h[2]) : 0);
        return { minutes, status: "minutes" };
    }
    const m = MINUTES_RE.exec(text);
    if (m) return { minutes: Number(m[1]), status: "minutes" };

    return { minutes: null, status: "unknown" };
}

/**
 * `DesvioHorario`: `±MM:SS` o `±HH:MM:SS` (misma interpretación que
 * `formatDesvio` en `features/arrivals/utils.ts`).
 */
export function parseDeviationMinutes(raw: string): number | null {
    const text = (raw ?? "").trim();
    const match = /^([+-]?)(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    if (!match) return null;
    const sign = match[1] === "-" ? -1 : 1;
    const minutes = match[4] !== undefined
        ? Number(match[2]) * 60 + Number(match[3])
        : Number(match[2]);
    return minutes === 0 ? 0 : sign * minutes;
}

/** Argentina no aplica horario de verano desde 2009: UTC−3 fijo. */
const AR_OFFSET = "-03:00";
const LOCAL_NO_TZ_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?$/;

export function parseGpsTimestamp(raw: string): number | null {
    const text = (raw ?? "").trim();
    if (!text) return null;
    const local = LOCAL_NO_TZ_RE.exec(text);
    const iso = local ? `${local[1]}T${local[2]}${local[3] ?? ":00"}${AR_OFFSET}` : text;
    if (!local && !/^\d{4}-\d{2}-\d{2}T/.test(text)) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}

function parseCoord(raw: string | undefined): number | null {
    const n = Number((raw ?? "").trim());
    return Number.isFinite(n) && n !== 0 ? n : null;
}

function nonZeroId(raw: string | undefined): string | null {
    const v = (raw ?? "").trim();
    return v && v !== "0" ? v : null;
}

export function normalizeArribo(
    a: Arribo,
    ctx: { stopId: string; lineCode: string; fetchedAt: number },
): NormalizedArrival {
    const eta = parseEtaMinutes(a.Arribo);
    const lat = parseCoord(a.Latitud);
    const lng = parseCoord(a.Longitud);
    const error = (a.MensajeError ?? "").trim();
    return {
        stopId: ctx.stopId,
        lineCode: ctx.lineCode,
        rawLineCode: (a.CodigoLineaParada ?? "").trim(),
        lineLabel: arriboLineaDescripcion(a),
        destination: arriboBanderaLabel(a),
        rawEta: (a.Arribo ?? "").trim(),
        etaMinutes: eta.minutes,
        status: eta.status,
        deviationMinutes: parseDeviationMinutes(a.DesvioHorario),
        vehicleId: nonZeroId(a.IdentificadorCoche),
        accessible: (a.EsAdaptado ?? "").trim().toLowerCase() === "true",
        vehiclePosition: lat !== null && lng !== null ? { lat, lng } : null,
        gpsAt: parseGpsTimestamp(a.UltimaFechaHoraGPS),
        fetchedAt: ctx.fetchedAt,
        errorMessage: error || null,
    };
}
