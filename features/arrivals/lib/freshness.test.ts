import { describe, expect, it } from "vitest";

import { freshnessOf, projectEtaMinutes } from "./freshness";

const MIN = 60_000;

describe("freshnessOf", () => {
    it("clasifica por antigüedad con bordes inclusivos hacia el estado peor", () => {
        expect(freshnessOf(0, 0)).toBe("fresh");
        expect(freshnessOf(0, 2 * MIN - 1)).toBe("fresh");
        expect(freshnessOf(0, 2 * MIN)).toBe("aging");
        expect(freshnessOf(0, 10 * MIN - 1)).toBe("aging");
        expect(freshnessOf(0, 10 * MIN)).toBe("stale");
    });

    it("trata un reloj que retrocede como dato fresco, no negativo", () => {
        expect(freshnessOf(5 * MIN, 0)).toBe("fresh");
    });

    it("acepta umbrales configurables", () => {
        expect(freshnessOf(0, 30_000, { agingMs: 20_000, staleMs: 60_000 })).toBe("aging");
    });
});

describe("projectEtaMinutes", () => {
    it("descuenta el tiempo transcurrido desde la consulta", () => {
        expect(projectEtaMinutes(10, 0, 3 * MIN)).toBe(7);
    });

    it("no baja de cero", () => {
        expect(projectEtaMinutes(2, 0, 5 * MIN)).toBe(0);
    });

    it("redondea hacia abajo minutos parciales", () => {
        expect(projectEtaMinutes(10, 0, 90_000)).toBe(8);
    });

    it("no proyecta datos vencidos ni ETA desconocido", () => {
        expect(projectEtaMinutes(10, 0, 10 * MIN)).toBeNull();
        expect(projectEtaMinutes(null, 0, 0)).toBeNull();
    });
});
