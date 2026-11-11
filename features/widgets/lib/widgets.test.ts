import { describe, expect, it } from "vitest";

import type { NormalizedArrival } from "@features/arrivals/lib/normalize";

import { parseWidgetConfigs, requiredQueries, type WidgetConfig, type WidgetTarget } from "./config";
import {
    activeSmartSlot,
    buildRow,
    indexSnapshots,
    resolveWidgetView,
    rowState,
    sortRows,
    type QuerySnapshot,
} from "./rows";

const MIN = 60_000;
// Miércoles 2026-11-11 08:45 en Mar del Plata.
const NOW = Date.parse("2026-11-11T11:45:00Z");

function target(stopId: string, lineCode: string, extra: Partial<WidgetTarget> = {}): WidgetTarget {
    return { stopId, stopLabel: `Parada ${stopId}`, lineCode, lineLabel: lineCode.slice(0, 3), destination: "", ...extra };
}

function arrival(stopId: string, lineCode: string, eta: number | null, extra: Partial<NormalizedArrival> = {}): NormalizedArrival {
    return {
        stopId,
        lineCode,
        rawLineCode: lineCode,
        lineLabel: lineCode.slice(0, 3),
        destination: "A CENTRO",
        rawEta: eta === null ? "" : `${eta} min. aprox.`,
        etaMinutes: eta,
        status: eta === null ? "unknown" : eta === 0 ? "arriving" : "minutes",
        deviationMinutes: null,
        vehicleId: null,
        accessible: false,
        vehiclePosition: null,
        gpsAt: null,
        fetchedAt: NOW,
        errorMessage: null,
        ...extra,
    };
}

function snap(stopId: string, lineCode: string, etas: (number | null)[], fetchedAt = NOW, error: string | null = null): QuerySnapshot {
    return { stopId, lineCode, fetchedAt, arrivals: etas.map((e) => arrival(stopId, lineCode, e)), error };
}

describe("parseWidgetConfigs", () => {
    const single = {
        version: 1,
        id: "w1",
        name: "Al trabajo",
        kind: "single",
        targets: [target("P1", "531011")],
    };

    it("acepta una configuración válida y completa defaults de visualización", () => {
        const r = parseWidgetConfigs([single]);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.configs[0].display).toEqual({ maxRows: 3, showSecondArrival: true, predictionSource: "official" });
    });

    it("rechaza un widget de una línea con dos destinos", () => {
        const r = parseWidgetConfigs([{ ...single, targets: [target("P1", "a"), target("P2", "b")] }]);
        expect(r.ok).toBe(false);
    });

    it("rechaza ids repetidos, versiones desconocidas y basura sin lanzar", () => {
        expect(parseWidgetConfigs([single, single]).ok).toBe(false);
        expect(parseWidgetConfigs([{ ...single, version: 2 }]).ok).toBe(false);
        expect(parseWidgetConfigs("{roto").ok).toBe(false);
        expect(parseWidgetConfigs(null).ok).toBe(false);
    });

    it("rechaza franjas con horas inválidas o días repetidos", () => {
        const smart = (slot: object) => ({ version: 1, id: "s", name: "Smart", kind: "smart", slots: [slot] });
        const slot = { place: "home", label: "Casa", days: [1, 2], from: "07:00", to: "09:00", targets: [target("P1", "a")] };
        expect(parseWidgetConfigs([smart(slot)]).ok).toBe(true);
        expect(parseWidgetConfigs([smart({ ...slot, from: "7:00" })]).ok).toBe(false);
        expect(parseWidgetConfigs([smart({ ...slot, days: [1, 1] })]).ok).toBe(false);
    });
});

describe("requiredQueries", () => {
    it("deduplica pares parada+línea entre configuraciones", () => {
        const configs = parseWidgetConfigs([
            { version: 1, id: "a", name: "A", kind: "single", targets: [target("P1", "531")] },
            { version: 1, id: "b", name: "B", kind: "multi", targets: [target("P1", "531"), target("P2", "531")] },
        ]);
        if (!configs.ok) throw new Error(configs.error);
        expect(requiredQueries(configs.configs)).toEqual([
            { stopId: "P1", lineCode: "531" },
            { stopId: "P2", lineCode: "531" },
        ]);
    });
});

describe("buildRow", () => {
    it("devuelve próximo y segundo arribo proyectados", () => {
        const idx = indexSnapshots([snap("P1", "531", [12, 4, null], NOW - 2 * MIN)]);
        const row = buildRow(target("P1", "531"), idx, NOW);
        expect(row.nextMinutes).toBe(2);
        expect(row.secondMinutes).toBe(10);
        expect(row.freshness).toBe("aging");
        expect(rowState(row)).toBe("ok");
    });

    it("sin snapshot → missing, no cero", () => {
        const row = buildRow(target("P9", "531"), indexSnapshots([]), NOW);
        expect(row.nextMinutes).toBeNull();
        expect(rowState(row)).toBe("missing");
    });

    it("dato vencido → oculta minutos", () => {
        const idx = indexSnapshots([snap("P1", "531", [5], NOW - 15 * MIN)]);
        const row = buildRow(target("P1", "531"), idx, NOW);
        expect(row.nextMinutes).toBeNull();
        expect(rowState(row)).toBe("stale");
    });

    it("filtra por sentido elegido", () => {
        const s = snap("P1", "531", []);
        s.arrivals = [arrival("P1", "531", 3, { destination: "A PUERTO" }), arrival("P1", "531", 8, { destination: "A CENTRO" })];
        const row = buildRow(target("P1", "531", { destination: "a centro" }), indexSnapshots([s]), NOW);
        expect(row.nextMinutes).toBe(8);
    });

    it("no mezcla arribos de otra parada aunque vengan en el mismo snapshot", () => {
        const s = snap("P1", "531", []);
        s.arrivals = [arrival("P2", "531", 1), arrival("P1", "531", 9)];
        expect(buildRow(target("P1", "531"), indexSnapshots([s]), NOW).nextMinutes).toBe(9);
    });

    it("propaga el error de consulta", () => {
        const idx = indexSnapshots([snap("P1", "531", [], NOW, "Sin conexión")]);
        const row = buildRow(target("P1", "531"), idx, NOW);
        expect(row.note).toBe("Sin conexión");
        expect(rowState(row)).toBe("error");
    });
});

describe("sortRows", () => {
    it("ordena cronológicamente y deja sin dato al final en orden estable", () => {
        const idx = indexSnapshots([snap("P1", "a", [9]), snap("P2", "b", [2]), snap("P3", "c", [])]);
        const rows = [target("P3", "c"), target("P1", "a"), target("P4", "d"), target("P2", "b")].map((t) => buildRow(t, idx, NOW));
        expect(sortRows(rows).map((r) => r.target.stopId)).toEqual(["P2", "P1", "P3", "P4"]);
    });
});

describe("widget inteligente", () => {
    const slots = [
        { place: "home" as const, label: "Casa → Trabajo", days: [1, 2, 3, 4, 5], from: "06:00", to: "10:00", targets: [target("P1", "531")] },
        { place: "work" as const, label: "Reunión miércoles", days: [3], from: "08:30", to: "09:00", targets: [target("P5", "573")] },
        { place: "university" as const, label: "Facultad (noche)", days: [3], from: "22:00", to: "02:00", targets: [target("P7", "541")] },
    ];

    it("elige la franja más específica cuando se solapan", () => {
        expect(activeSmartSlot(slots, NOW)?.label).toBe("Reunión miércoles");
        expect(activeSmartSlot(slots, NOW + 30 * MIN)?.label).toBe("Casa → Trabajo");
    });

    it("franja nocturna del miércoles sigue activa el jueves 01:00", () => {
        const thu0100 = Date.parse("2026-11-12T04:00:00Z");
        expect(activeSmartSlot(slots, thu0100)?.label).toBe("Facultad (noche)");
        const fri0100 = Date.parse("2026-11-13T04:00:00Z");
        expect(activeSmartSlot(slots, fri0100)).toBeNull();
    });

    it("fuera de franja usa fallback", () => {
        const parsed = parseWidgetConfigs([
            { version: 1, id: "s", name: "Inteligente", kind: "smart", slots, fallbackTargets: [target("P9", "511")] },
        ]);
        if (!parsed.ok) throw new Error(parsed.error);
        const sunday = Date.parse("2026-11-15T15:00:00Z");
        const view = resolveWidgetView(parsed.configs[0], indexSnapshots([snap("P9", "511", [6])]), sunday);
        expect(view.context).toBeNull();
        expect(view.rows.map((r) => r.target.stopId)).toEqual(["P9"]);
    });
});

describe("resolveWidgetView", () => {
    it("multilínea respeta maxRows y reporta la actualización más vieja", () => {
        const config: WidgetConfig = {
            version: 1,
            id: "m",
            name: "Varias",
            kind: "multi",
            display: { maxRows: 2, showSecondArrival: false, predictionSource: "official" },
            targets: [target("P1", "a"), target("P2", "b"), target("P3", "c")],
        };
        const idx = indexSnapshots([snap("P1", "a", [9], NOW - MIN), snap("P2", "b", [3], NOW - 3 * MIN), snap("P3", "c", [5])]);
        const view = resolveWidgetView(config, idx, NOW);
        expect(view.rows.map((r) => r.target.stopId)).toEqual(["P2", "P3"]);
        expect(view.oldestUpdate).toBe(NOW - 3 * MIN);
    });
});
