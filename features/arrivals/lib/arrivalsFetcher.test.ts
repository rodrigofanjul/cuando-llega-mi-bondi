import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/api/client", () => ({
    swrFetcherWithMeta: vi.fn(async () => ({ data: { arribos: [{ id: 1 }] }, meta: { cache: "HIT" } })),
}));

import { swrFetcherWithMeta } from "@shared/api/client";
import { arrivalsFetcher } from "./arrivalsFetcher";

describe("arrivalsFetcher", () => {
    afterEach(() => vi.useRealTimers());

    it("estampa fetchedAt y deja pasar los datos", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
        const key = ["RecuperarProximosArribosW", { identificadorParada: "1", codigoLineaParada: "2" }] as never;
        const res = await arrivalsFetcher(key);
        expect(swrFetcherWithMeta).toHaveBeenCalledWith(key);
        expect(res.fetchedAt).toBe(Date.parse("2026-11-12T12:00:00Z"));
        expect(res.data).toEqual({ arribos: [{ id: 1 }] });
        expect(res.meta).toEqual({ cache: "HIT" });
    });
});