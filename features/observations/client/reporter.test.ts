import { describe, expect, it, vi } from "vitest";

import type { QuerySnapshot } from "@features/widgets/lib/rows";

import { ObservationSampler } from "../lib/observations";
import { createObservationReporter } from "./reporter";

const snap: QuerySnapshot = {
    stopId: "P1",
    lineCode: "531",
    fetchedAt: 1_794_397_500_000,
    error: null,
    arrivals: [
        {
            stopId: "P1",
            lineCode: "531",
            rawLineCode: "531",
            lineLabel: "531",
            destination: "A CENTRO",
            rawEta: "5 min. aprox.",
            etaMinutes: 5,
            status: "minutes",
            deviationMinutes: null,
            vehicleId: "C1",
            accessible: false,
            vehiclePosition: null,
            gpsAt: null,
            fetchedAt: 1_794_397_500_000,
            errorMessage: null,
        },
    ],
};

describe("observation reporter", () => {
    it("apagado: no envía nada", async () => {
        const send = vi.fn(async () => {});
        const report = createObservationReporter({ enabled: () => false, send, sampler: new ObservationSampler() });
        expect(await report(snap, "user_query")).toBe(0);
        expect(send).not.toHaveBeenCalled();
    });

    it("encendido: envía muestreado (1 por minuto por par)", async () => {
        const send = vi.fn(async () => {});
        const report = createObservationReporter({ enabled: () => true, send, sampler: new ObservationSampler() });
        expect(await report(snap, "user_query")).toBe(1);
        expect(await report({ ...snap, fetchedAt: snap.fetchedAt + 25_000 }, "user_query")).toBe(0);
        expect(send).toHaveBeenCalledOnce();
        expect(JSON.parse((send.mock.calls[0] as unknown as [string])[0]).observations[0]).toMatchObject({ stopId: "P1", etaMinutes: 5 });
    });
});
