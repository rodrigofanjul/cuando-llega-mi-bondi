import { describe, expect, it } from "vitest";

import type { SearchIndex } from "./searchIndex";
import { looksLikeQuestion, quickSearch } from "./quickSearch";

const idx: SearchIndex = {
    v: 1,
    generatedAt: "2026-11-12",
    lines: [["98", "511"], ["120", "542"], ["130", "573"]],
    stops: [
        { id: "A", street: "LURO", cross: "SALTA", lat: -38.0, lng: -57.55, flag: "A PUERTO", lines: [["98", "511"], ["120", "542"]] },
        { id: "B", street: "LURO", cross: "CORDOBA", lat: -38.001, lng: -57.551, flag: null, lines: [["98", "511"]] },
        { id: "C", street: "INDEPENDENCIA", cross: "COLON", lat: -38.01, lng: -57.56, flag: null, lines: [["130", "573"]] },
        { id: "D", street: "12 DE OCTUBRE", cross: "ACHA", lat: -38.02, lng: -57.57, flag: null, lines: [["98", "511"]] },
    ],
};

describe("quickSearch", () => {
    it("sólo línea → calles de esa línea", () => {
        const r = quickSearch(idx, "511", {});
        expect(r.kind).toBe("streets-of-line");
        expect(r.items.map((i) => i.title)).toEqual(["12 de Octubre", "Luro"]);
    });

    it("línea + calle → paradas de esa línea sobre esa calle", () => {
        const r = quickSearch(idx, "511 luro", {});
        expect(r.kind).toBe("stops");
        expect(r.items.map((i) => [i.stopId, i.lineCode])).toEqual([["B", "98"], ["A", "98"]]);
        expect(r.items[1].title).toBe("Luro y Salta");
    });

    it("esquina → todas las líneas de esa esquina", () => {
        for (const q of ["luro y salta", "luro salta", "salta y luro", "LURO Y SALTA"]) {
            const r = quickSearch(idx, q, {});
            expect(r.items.map((i) => i.lineLabel)).toEqual(["511", "542"]);
        }
    });

    it("tolera un error de tipeo en palabras largas", () => {
        expect(quickSearch(idx, "luro y sallta", {}).items.length).toBe(2);
        expect(quickSearch(idx, "indepndencia", {}).items[0].title).toBe("Independencia y Colon");
    });

    it("una calle → esquinas de esa calle", () => {
        const r = quickSearch(idx, "luro", {});
        expect(r.kind).toBe("corners");
        expect(r.items.map((i) => i.title)).toEqual(["Luro y Cordoba", "Luro y Salta"]);
    });

    it("favoritos primero y luego cercanía", () => {
        const r = quickSearch(idx, "luro", { favoriteStopIds: new Set(["A"]) });
        expect(r.items[0].title).toBe("Luro y Salta");
        const near = quickSearch(idx, "luro", { near: { lat: -38.001, lng: -57.551 } });
        expect(near.items[0].title).toBe("Luro y Cordoba");
    });

    it("sin coincidencias → vacío", () => {
        expect(quickSearch(idx, "xyzzy", {}).items).toEqual([]);
    });

    it("máximo 8 resultados", () => {
        const many: SearchIndex = { ...idx, stops: Array.from({ length: 20 }, (_, i) => ({ ...idx.stops[0], id: `S${i}`, cross: `CALLE ${i}` })) };
        expect(quickSearch(many, "luro", {}).items.length).toBe(8);
    });

    it("detecta preguntas", () => {
        expect(looksLikeQuestion("¿cómo llego al puerto?")).toBe(true);
        expect(looksLikeQuestion("cuando pasa el 511")).toBe(true);
        expect(looksLikeQuestion("511 luro")).toBe(false);
    });

    it("etiquetas reales: letras y varias palabras", () => {
        const real: SearchIndex = {
            ...idx,
            lines: [...idx.lines, ["200", "593C"], ["210", "221 COSTA AZUL"]],
            stops: [
                ...idx.stops,
                { id: "E", street: "LURO", cross: "MITRE", lat: -38.03, lng: -57.58, flag: null, lines: [["200", "593C"]] },
                { id: "F", street: "COSTA", cross: "PLAYA", lat: -38.04, lng: -57.59, flag: null, lines: [["210", "221 COSTA AZUL"]] },
            ],
        };
        expect(quickSearch(real, "593c", {}).kind).toBe("streets-of-line");
        expect(quickSearch(real, "593c", {}).items[0].lineCode).toBe("200");
        const r = quickSearch(real, "593C luro", {});
        expect(r.items.map((i) => [i.stopId, i.lineCode])).toEqual([["E", "200"]]);
        const m = quickSearch(real, "221 costa azul", {});
        expect(m.kind).toBe("streets-of-line");
        expect(m.items[0].lineCode).toBe("210");
    });

    it("un número de calle no se confunde con una línea", () => {
        const withTwelve: SearchIndex = {
            ...idx,
            lines: [...idx.lines, ["300", "12"]],
            stops: [...idx.stops, { id: "G", street: "ALEM", cross: "SAN LUIS", lat: -38.05, lng: -57.6, flag: null, lines: [["300", "12"]] }],
        };
        const r = quickSearch(withTwelve, "12 de octubre", {});
        expect(r.items.map((i) => i.stopId)).toEqual(["D"]);
        expect(quickSearch(withTwelve, "12", {}).kind).toBe("streets-of-line");
        expect(quickSearch(withTwelve, "12", {}).items.map((i) => i.title)).toEqual(["Alem"]);
    });
});
