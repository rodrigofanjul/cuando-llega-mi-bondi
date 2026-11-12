import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { resetMetrics, snapshot } from "@/lib/server/metrics";

const { POST } = await import("./route");

const req = (body: unknown) =>
    new NextRequest("http://localhost/api/ux", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/ux", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        resetMetrics();
    });

    it("apagado → 404", async () => {
        expect((await POST(req({ type: "quick_alert" }))).status).toBe(404);
    });

    it("rechaza eventos inválidos", async () => {
        vi.stubEnv("NEXT_PUBLIC_UX_METRICS_ENABLED", "true");
        expect((await POST(req({ type: "nope" }))).status).toBe(400);
        expect((await POST(req("no-json"))).status).toBe(400);
    });

    it("acepta y cuenta eventos válidos", async () => {
        vi.stubEnv("NEXT_PUBLIC_UX_METRICS_ENABLED", "true");
        expect((await POST(req({ type: "time_to_minutes", ms: 500 }))).status).toBe(204);
        expect((await POST(req({ type: "quick_alert" }))).status).toBe(204);
        expect(snapshot().counters["ux.time_to_minutes.lt1s"]).toBe(1);
        expect(snapshot().counters["ux.quick_alert"]).toBe(1);
    });
});
