import { beforeEach, describe, expect, it } from "vitest";

import { increment, recordRequest, resetMetrics, snapshot, withMetrics } from "./metrics";

describe("metrics", () => {
    beforeEach(() => resetMetrics());

    it("agrega por ruta con tasa de error y percentiles", () => {
        [10, 20, 30, 40, 100].forEach((ms, i) => recordRequest("/api/x", i === 4 ? 503 : 200, ms));
        increment("assistant.tokens.in", 1200);
        const s = snapshot();
        expect(s.routes["/api/x"]).toMatchObject({ count: 5, byStatus: { 200: 4, 503: 1 }, errorRate: 0.2, p50ms: 30, p95ms: 100 });
        expect(s.counters["assistant.tokens.in"]).toBe(1200);
    });

    it("withMetrics registra estado y excepciones como 500", async () => {
        const ok = withMetrics("/ok", async () => new Response(null, { status: 201 }));
        const boom = withMetrics("/boom", async () => {
            throw new Error("x");
        });
        await ok();
        await expect(boom()).rejects.toThrow();
        const s = snapshot();
        expect(s.routes["/ok"].byStatus).toEqual({ 201: 1 });
        expect(s.routes["/boom"].byStatus).toEqual({ 500: 1 });
    });
});
