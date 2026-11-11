import { describe, expect, it } from "vitest";

import vectors from "@shared/contracts/arrival-vectors.json";
import type { Arribo } from "@features/arrivals/types";
import {
    normalizeArribo,
    parseDeviationMinutes,
    parseEtaMinutes,
    parseGpsTimestamp,
} from "./normalize";

function arribo(overrides: Partial<Arribo> = {}): Arribo {
    return {
        DescripcionLinea: "531",
        DescripcionCartelBandera: "A CENTRO",
        Arribo: "7 min. aprox.",
        CodigoLineaParada: "531011",
        DesvioHorario: "+02:00",
        EsAdaptado: "True",
        IdentificadorChofer: "0",
        IdentificadorCoche: "1234",
        Latitud: "-38.0055",
        LatitudParada: "-38.0000",
        Longitud: "-57.5426",
        LongitudParada: "-57.5400",
        UltimaFechaHoraGPS: "2026-11-11 08:45:12",
        MensajeError: "",
        ...overrides,
    };
}

describe("vectores compartidos (contrato TS/Kotlin/Swift)", () => {
    it.each(vectors.eta)("ETA %j", (v) => {
        expect(parseEtaMinutes(v.raw)).toEqual({ minutes: v.minutes, status: v.status });
    });

    it.each(vectors.deviation)("desvío %j", (v) => {
        expect(parseDeviationMinutes(v.raw)).toBe(v.minutes);
    });

    it.each(vectors.gpsTimestamp)("timestamp GPS %j", (v) => {
        expect(parseGpsTimestamp(v.raw)).toBe(v.epochMs);
    });
});

describe("normalizeArribo", () => {
    it("normaliza un arribo completo", () => {
        const n = normalizeArribo(arribo(), { stopId: "P11003", lineCode: "531", fetchedAt: 1_000 });
        expect(n).toEqual({
            stopId: "P11003",
            lineCode: "531",
            rawLineCode: "531011",
            lineLabel: "531",
            destination: "A CENTRO",
            rawEta: "7 min. aprox.",
            etaMinutes: 7,
            status: "minutes",
            deviationMinutes: 2,
            vehicleId: "1234",
            accessible: true,
            vehiclePosition: { lat: -38.0055, lng: -57.5426 },
            gpsAt: 1794397512000,
            fetchedAt: 1_000,
            errorMessage: null,
        });
    });

    it("no inventa datos ausentes", () => {
        const n = normalizeArribo(
            arribo({
                Arribo: "Sin datos",
                IdentificadorCoche: "0",
                Latitud: "0",
                Longitud: "0",
                UltimaFechaHoraGPS: "",
                DesvioHorario: "",
                EsAdaptado: "False",
            }),
            { stopId: "P1", lineCode: "531", fetchedAt: 0 },
        );
        expect(n.etaMinutes).toBeNull();
        expect(n.status).toBe("unknown");
        expect(n.vehicleId).toBeNull();
        expect(n.vehiclePosition).toBeNull();
        expect(n.gpsAt).toBeNull();
        expect(n.deviationMinutes).toBeNull();
        expect(n.accessible).toBe(false);
    });

    it("conserva el mensaje de error de la API", () => {
        const n = normalizeArribo(arribo({ MensajeError: " Sin servicio " }), {
            stopId: "P1",
            lineCode: "531",
            fetchedAt: 0,
        });
        expect(n.errorMessage).toBe("Sin servicio");
    });

    it("usa descripción de bandera alternativa si falta el cartel", () => {
        const n = normalizeArribo(
            arribo({ DescripcionCartelBandera: undefined, DescripcionBandera: "A PUERTO" }),
            { stopId: "P1", lineCode: "531", fetchedAt: 0 },
        );
        expect(n.destination).toBe("A PUERTO");
    });
});
