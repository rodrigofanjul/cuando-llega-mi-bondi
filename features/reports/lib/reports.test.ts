import { describe, expect, it } from "vitest";

import {
    clusterReports,
    estimateOccupancy,
    expiresAt,
    isCorroborated,
    moderateText,
    reportSubmissionSchema,
    reputationWeight,
    type StoredReport,
} from "./reports";

const MIN = 60_000;
const NOW = Date.parse("2026-11-11T12:00:00Z");
let seq = 0;

function rep(type: StoredReport["type"], reporter: string, minutesAgo: number, extra: Partial<StoredReport> = {}): StoredReport {
    const createdAt = NOW - minutesAgo * MIN;
    return {
        id: `r${++seq}`,
        type,
        lineCode: "531",
        stopId: "P1",
        occupancy: null,
        text: null,
        reporterHash: reporter,
        createdAt,
        expiresAt: expiresAt(type, createdAt),
        status: "approved",
        ...extra,
    };
}

describe("reportSubmissionSchema", () => {
    const base = { type: "demora", lineCode: "531", stopId: "P1", deviceId: "a1b2c3d4e5f6a7b8c9d0" };
    it("valida tipo, ocupación y deviceId", () => {
        expect(reportSubmissionSchema.safeParse(base).success).toBe(true);
        expect(reportSubmissionSchema.safeParse({ ...base, type: "ocupacion" }).success).toBe(false);
        expect(reportSubmissionSchema.safeParse({ ...base, type: "ocupacion", occupancy: "alta" }).success).toBe(true);
        expect(reportSubmissionSchema.safeParse({ ...base, occupancy: "alta" }).success).toBe(false);
        expect(reportSubmissionSchema.safeParse({ ...base, deviceId: "corto" }).success).toBe(false);
        expect(reportSubmissionSchema.safeParse({ ...base, text: "x".repeat(201) }).success).toBe(false);
    });
});

describe("moderateText", () => {
    it("aprueba texto normal y deja pendiente enlaces, contactos e insultos", () => {
        expect(moderateText(null).status).toBe("approved");
        expect(moderateText("Viene lleno desde la terminal").status).toBe("approved");
        expect(moderateText("mirá www.ejemplo.com")).toEqual({ status: "pending", reason: "enlace" });
        expect(moderateText("llamame 223 555 1234")).toEqual({ status: "pending", reason: "teléfono" });
        expect(moderateText("escribime a alguien@mail.com")).toEqual({ status: "pending", reason: "correo" });
        expect(moderateText("el chofer es un forro")).toEqual({ status: "pending", reason: "lenguaje" });
    });
});

describe("clusterReports", () => {
    it("un reporte aislado no se muestra; dos personas sí, como no confirmado", () => {
        expect(clusterReports([rep("demora", "a", 5)], NOW)).toEqual([]);
        const c = clusterReports([rep("demora", "a", 5), rep("demora", "b", 2)], NOW);
        expect(c).toHaveLength(1);
        expect(c[0]).toMatchObject({ reporters: 2, confirmed: false });
        expect(c[0].label).toBe("Demora · reportado por 2 personas (último hace 2 min) · no confirmado");
    });

    it("el mismo dispositivo cuenta una vez (antispam)", () => {
        expect(clusterReports([rep("demora", "a", 5), rep("demora", "a", 3), rep("demora", "a", 1)], NOW)).toEqual([]);
    });

    it("excluye vencidos, pendientes y ocupación (que se estima aparte)", () => {
        expect(clusterReports([rep("demora", "a", 50), rep("demora", "b", 60)], NOW)).toEqual([]);
        expect(clusterReports([rep("demora", "a", 1, { status: "pending" }), rep("demora", "b", 1)], NOW)).toEqual([]);
        expect(clusterReports([rep("ocupacion", "a", 1, { occupancy: "alta" }), rep("ocupacion", "b", 1, { occupancy: "alta" })], NOW)).toEqual([]);
    });

    it("pondera por reputación", () => {
        const weights = new Map([["a", 1.5], ["b", 1.5]]);
        const [c] = clusterReports([rep("desvio", "a", 10), rep("desvio", "b", 20)], NOW, weights);
        expect(c.weight).toBe(3);
    });
});

describe("estimateOccupancy", () => {
    const occ = (r: string, level: "baja" | "media" | "alta", ago: number) => rep("ocupacion", r, ago, { occupancy: level });

    it("información insuficiente con menos de 2 personas", () => {
        expect(estimateOccupancy([occ("a", "alta", 1)], "531", NOW)).toMatchObject({ level: "informacion_insuficiente", reporters: 1 });
    });

    it("promedio ponderado por recencia, con procedencia", () => {
        const e = estimateOccupancy([occ("a", "alta", 1), occ("b", "alta", 3), occ("c", "baja", 25)], "531", NOW);
        expect(e.level).toBe("alta");
        expect(e.provenance).toBe("Estimada con 3 reportes de usuarios de los últimos 30 min. Experimental, no confirmada.");
    });

    it("usa sólo el último reporte de cada persona", () => {
        const e = estimateOccupancy([occ("a", "alta", 20), occ("a", "baja", 1), occ("b", "baja", 2)], "531", NOW);
        expect(e).toMatchObject({ level: "baja", reporters: 2 });
    });
});

describe("reputación", () => {
    it("prior neutro y cotas", () => {
        expect(reputationWeight(0, 0)).toBe(1);
        // (20 + 2) / (20 + 4) + 0,5
        expect(reputationWeight(20, 20)).toBeCloseTo(1.4167, 4);
        expect(reputationWeight(0, 50)).toBeCloseTo(0.537, 3);
        expect(reputationWeight(1000, 1000)).toBeLessThanOrEqual(1.5);
    });

    it("corroboración por otra persona o por el dato oficial", () => {
        const a = rep("demora", "a", 10);
        const b = rep("demora", "b", 5);
        const solo = rep("desvio", "c", 5);
        expect(isCorroborated(a, [a, b])).toBe(true);
        expect(isCorroborated(solo, [solo])).toBe(false);
        expect(isCorroborated(a, [a], 7)).toBe(true);
        expect(isCorroborated(a, [a, rep("demora", "a", 4)])).toBe(false);
    });
});
