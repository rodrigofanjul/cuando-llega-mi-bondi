import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WidgetConfig } from "@features/widgets/lib/config";
import { createWidgetBridge } from "@features/widgets/native/bridge";

import { __setWidgetBridgeForTests, useWidgetConfigsStore } from "./useWidgetConfigsStore";

const cfg = (id: string): WidgetConfig => ({
    version: 1,
    id,
    name: `W ${id}`,
    kind: "single",
    display: { maxRows: 3, showSecondArrival: true, predictionSource: "official" },
    targets: [{ stopId: "P1", stopLabel: "Luro y Salta", lineCode: "531", lineLabel: "531", destination: "" }],
});

describe("useWidgetConfigsStore", () => {
    const saveStore = vi.fn(async () => {});
    const reloadWidgets = vi.fn(async () => {});

    beforeEach(() => {
        saveStore.mockClear();
        __setWidgetBridgeForTests(
            createWidgetBridge({
                isNative: () => true,
                plugin: { saveStore, reloadWidgets, pushSnapshots: vi.fn(async () => {}) },
                now: () => 0,
                apiBase: () => "https://bondimdp.com.ar/api",
            }),
        );
        useWidgetConfigsStore.setState({ configs: [], syncError: null });
    });

    it("alta, edición y baja sincronizan con el plugin", async () => {
        const { upsert, remove } = useWidgetConfigsStore.getState();
        upsert(cfg("a"));
        upsert({ ...cfg("a"), name: "Editado" });
        upsert(cfg("b"));
        remove("a");
        await vi.waitFor(() => expect(saveStore).toHaveBeenCalledTimes(4));
        expect(useWidgetConfigsStore.getState().configs.map((c) => c.name)).toEqual(["W b"]);
        const last = JSON.parse((saveStore.mock.calls.at(-1) as unknown as [{ json: string }])[0].json);
        expect(last.configs.map((c: WidgetConfig) => c.id)).toEqual(["b"]);
    });

    it("expone el error de sincronización", async () => {
        saveStore.mockRejectedValueOnce(new Error("App Group no disponible"));
        useWidgetConfigsStore.getState().upsert(cfg("a"));
        await vi.waitFor(() => expect(useWidgetConfigsStore.getState().syncError).toBe("App Group no disponible"));
    });
});
