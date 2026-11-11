import { describe, expect, it, vi } from "vitest";

import type { WidgetConfig } from "@features/widgets/lib/config";
import type { QuerySnapshot } from "@features/widgets/lib/rows";

import { createWidgetBridge, type BondiWidgetPlugin } from "./bridge";

const config: WidgetConfig = {
    version: 1,
    id: "w1",
    name: "Casa",
    kind: "single",
    display: { maxRows: 3, showSecondArrival: true, predictionSource: "official" },
    targets: [{ stopId: "P1", stopLabel: "Luro y Salta", lineCode: "531", lineLabel: "531", destination: "" }],
};

const snapshot: QuerySnapshot = {
    stopId: "P1",
    lineCode: "531",
    fetchedAt: 1000,
    error: null,
    arrivals: [
        {
            stopId: "P1",
            lineCode: "531",
            rawLineCode: "531",
            lineLabel: "531",
            destination: "A CENTRO",
            rawEta: "4 min. aprox.",
            etaMinutes: 4,
            status: "minutes",
            deviationMinutes: 1,
            vehicleId: "C1",
            accessible: true,
            vehiclePosition: { lat: -38, lng: -57.5 },
            gpsAt: 900,
            fetchedAt: 1000,
            errorMessage: null,
        },
    ],
};

function mockPlugin(): BondiWidgetPlugin & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        saveStore: vi.fn(async ({ json }) => void calls.push(`save:${json}`)),
        pushSnapshots: vi.fn(async ({ json }) => void calls.push(`push:${json}`)),
        reloadWidgets: vi.fn(async () => void calls.push("reload")),
    };
}

describe("widget bridge", () => {
    it("en web no llama al plugin", async () => {
        const plugin = mockPlugin();
        const bridge = createWidgetBridge({ isNative: () => false, plugin, now: () => 0, apiBase: () => "" });
        expect(await bridge.saveConfigs([config])).toBe(false);
        expect(await bridge.pushSnapshots([snapshot])).toBe(false);
        expect(plugin.calls).toEqual([]);
    });

    it("guarda el store v1 y recarga widgets", async () => {
        const plugin = mockPlugin();
        const bridge = createWidgetBridge({
            isNative: () => true,
            plugin,
            now: () => 42,
            apiBase: () => "https://bondimdp.com.ar/api/",
        });
        await bridge.saveConfigs([config]);
        expect(plugin.calls[1]).toBe("reload");
        const stored = JSON.parse(plugin.calls[0].slice("save:".length));
        expect(stored).toEqual({ version: 1, apiBase: "https://bondimdp.com.ar/api", configs: [config], savedAt: 42 });
    });

    it("el snapshot no incluye posición GPS ni datos que el widget no usa", async () => {
        const plugin = mockPlugin();
        const bridge = createWidgetBridge({ isNative: () => true, plugin, now: () => 0, apiBase: () => "" });
        await bridge.pushSnapshots([snapshot]);
        const payload = JSON.parse(plugin.calls[0].slice("push:".length));
        expect(payload.snapshots[0].arrivals[0]).toEqual({
            lineCode: "531",
            destination: "A CENTRO",
            etaMinutes: 4,
            status: "minutes",
            vehicleId: "C1",
        });
    });
});
