import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { recordRequest, resetMetrics } from "@/lib/server/metrics";

// `connection()` sólo existe dentro de una request de Next; en tests se simula.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

const { GET } = await import("./route");

const req = (auth?: string) => new NextRequest("http://localhost/api/metrics", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/metrics", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        resetMetrics();
    });

    it("sin token configurado no existe", async () => {
        expect((await GET(req("Bearer x"))).status).toBe(404);
    });

    it("exige el token correcto", async () => {
        vi.stubEnv("METRICS_TOKEN", "s3cret-token");
        expect((await GET(req())).status).toBe(401);
        expect((await GET(req("Bearer otro-token!"))).status).toBe(401);
        recordRequest("/api/predict GET", 200, 12);
        const ok = await GET(req("Bearer s3cret-token"));
        expect(ok.status).toBe(200);
        expect((await ok.json()).routes["/api/predict GET"].count).toBe(1);
    });
});
