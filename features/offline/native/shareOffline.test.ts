import { beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "@features/offline/lib/__fixtures__/profiles-synthetic.json";
import { profileArtifactSchema } from "@features/offline/lib/profiles";
import type { OfflineWidgetTable } from "@features/offline/lib/widgetTable";
import type { WidgetConfig } from "@features/widgets/lib/config";

import { __resetOfflineShareForTests, shareOfflineWithWidgets } from "./shareOffline";

const profile = profileArtifactSchema.parse(fixture.profile);
const NOW = Date.parse("2026-11-11T11:07:00Z");

function config(stopId: string, lineCode: string): WidgetConfig {
    return {
        version: 1,
        id: `w-${stopId}`,
        name: "Casa",
        kind: "single",
        targets: [{ stopId, stopLabel: "Parada", lineCode, lineLabel: lineCode, destination: "" }],
        slots: [],
        fallbackTargets: [],
        display: { maxRows: 3, showSecondArrival: true },
    } as unknown as WidgetConfig;
}

function bridge(available = true) {
    const sent: OfflineWidgetTable[] = [];
    return {
        sent,
        available,
        saveOfflineTable: vi.fn(async (t: OfflineWidgetTable) => {
            sent.push(t);
            return true;
        }),
    };
}

describe("shareOfflineWithWidgets", () => {
    beforeEach(() => __resetOfflineShareForTests());

    it("en web no hace nada", async () => {
        const b = bridge(false);
        expect(await shareOfflineWithWidgets(b, profile, [config("A-S1", "A")], NOW, NOW)).toBe(false);
        expect(b.saveOfflineTable).not.toHaveBeenCalled();
    });

    it("envía sólo los pares de los widgets y no repite si nada cambió", async () => {
        const b = bridge();
        expect(await shareOfflineWithWidgets(b, profile, [config("A-S1", "A")], NOW, NOW)).toBe(true);
        expect(Object.keys(b.sent[0].entries)).toEqual(["A-S1|A"]);
        expect(b.sent[0].syncedAt).toBe(NOW);
        expect(await shareOfflineWithWidgets(b, profile, [config("A-S1", "A")], NOW, NOW + 60_000)).toBe(false);
        // Al día siguiente se reenvía (el horizonte avanza un día).
        expect(await shareOfflineWithWidgets(b, profile, [config("A-S1", "A")], NOW, NOW + 86_400_000)).toBe(true);
    });

    it("sin perfil manda una tabla vacía (el widget deja de estimar)", async () => {
        const b = bridge();
        await shareOfflineWithWidgets(b, null, [config("A-S1", "A")], null, NOW);
        expect(b.sent[0].entries).toEqual({});
        expect(b.sent[0].dataSource).toBe("none");
    });

    it("si el shell nativo falla, reintenta en la próxima llamada", async () => {
        const b = { available: true, saveOfflineTable: vi.fn(async () => false) };
        expect(await shareOfflineWithWidgets(b, profile, [config("A-S1", "A")], NOW, NOW)).toBe(false);
        await shareOfflineWithWidgets(b, profile, [config("A-S1", "A")], NOW, NOW);
        expect(b.saveOfflineTable).toHaveBeenCalledTimes(2);
    });
});
