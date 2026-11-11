import { describe, expect, it, vi } from "vitest";

import type { Arribo } from "@features/arrivals/types";
import type { WidgetConfig } from "@features/widgets/lib/config";

import { shareArrivalsWithWidgets, snapshotForWidgets } from "./shareArrivals";

const config: WidgetConfig = {
    version: 1,
    id: "w",
    name: "Casa",
    kind: "single",
    display: { maxRows: 3, showSecondArrival: true, predictionSource: "official" },
    targets: [{ stopId: "P1", stopLabel: "Luro y Salta", lineCode: "531", lineLabel: "531", destination: "" }],
};

const arribo = { Arribo: "6 min. aprox.", CodigoLineaParada: "531011", DescripcionCartelBandera: "A CENTRO", IdentificadorCoche: "77" } as Arribo;

describe("snapshotForWidgets", () => {
    it("sólo para pares que un widget usa", () => {
        expect(snapshotForWidgets([config], "P9", "531", [arribo], 1)).toBeNull();
        expect(snapshotForWidgets([], "P1", "531", [arribo], 1)).toBeNull();
        const s = snapshotForWidgets([config], "P1", "531", [arribo], 1);
        expect(s?.arrivals[0]).toMatchObject({ lineCode: "531", rawLineCode: "531011", etaMinutes: 6, vehicleId: "77" });
    });
});

describe("shareArrivalsWithWidgets", () => {
    it("no hace nada en la web", async () => {
        const pushSnapshots = vi.fn(async () => true);
        expect(await shareArrivalsWithWidgets({ available: false, pushSnapshots }, [config], "P1", "531", [arribo], 1)).toBe(false);
        expect(pushSnapshots).not.toHaveBeenCalled();
    });

    it("empuja el snapshot en nativo", async () => {
        const pushSnapshots = vi.fn(async () => true);
        expect(await shareArrivalsWithWidgets({ available: true, pushSnapshots }, [config], "P1", "531", [arribo], 1)).toBe(true);
        expect(pushSnapshots).toHaveBeenCalledOnce();
    });
});
