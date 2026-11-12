import { describe, expect, it } from "vitest";

import type { ParadaGeo } from "@features/trip-planner/types";

import { buildSearchIndex, SEARCH_INDEX_VERSION } from "./searchIndex";

const paradas: ParadaGeo[] = [
    { identificador: "10101", lat: -38.0001, lng: -57.5501, abreviaturaBandera: "A PUERTO", calleLabel: "12 DE OCTUBRE - MAR DEL PLATA", interseccionLabel: "ACHA - MAR DEL PLATA", lineas: [{ codigoLineaParada: "98", descripcion: "511" }] },
    { identificador: "10102", lat: -38.0002, lng: -57.5502, abreviaturaBandera: null, calleLabel: "LURO - MAR DEL PLATA", interseccionLabel: "SALTA - MAR DEL PLATA", lineas: [{ codigoLineaParada: "98", descripcion: "511" }, { codigoLineaParada: "120", descripcion: "542" }] },
    { identificador: "SIN", lat: -38, lng: -57.5, abreviaturaBandera: null, calleLabel: null, interseccionLabel: null, lineas: [] },
];

describe("buildSearchIndex", () => {
    const idx = buildSearchIndex(paradas, "2026-11-12");

    it("tiene versión y fecha", () => {
        expect(idx.v).toBe(SEARCH_INDEX_VERSION);
        expect(idx.generatedAt).toBe("2026-11-12");
    });

    it("limpia el sufijo de ciudad y redondea coordenadas a 5 decimales", () => {
        expect(idx.stops[0]).toEqual({ id: "10101", street: "12 DE OCTUBRE", cross: "ACHA", lat: -38.0001, lng: -57.5501, flag: "A PUERTO", lines: [["98", "511"]] });
    });

    it("descarta paradas sin calle o sin líneas", () => {
        expect(idx.stops.map((s) => s.id)).toEqual(["10101", "10102"]);
    });

    it("lista líneas únicas ordenadas por número visible", () => {
        expect(idx.lines).toEqual([["98", "511"], ["120", "542"]]);
    });
});
