import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runJob = vi.fn();
vi.mock("@/lib/server/inferArrivalsJob", () => ({ runInferArrivalsJob: (...a: unknown[]) => runJob(...a) }));
vi.mock("@/lib/server/supabaseAdmin", () => ({ createAdminClient: () => ({}) }));

const { GET } = await import("./route");

const req = (auth?: string) => new NextRequest("http://localhost/api/cron/infer-arrivals", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/infer-arrivals", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        runJob.mockReset();
    });

    it("sin CRON_SECRET la ruta no existe", async () => {
        expect((await GET(req("Bearer x"))).status).toBe(404);
        expect(runJob).not.toHaveBeenCalled();
    });

    it("exige el secreto exacto", async () => {
        vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
        expect((await GET(req())).status).toBe(401);
        expect((await GET(req("Bearer secreto-de-prueb"))).status).toBe(401);
        expect(runJob).not.toHaveBeenCalled();
    });

    it("corre el job y devuelve el resumen; ante error de la base responde 503 sin detalles", async () => {
        vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
        runJob.mockResolvedValueOnce({ read: 10, series: 1, inferred: 2, untracked: 0, truncated: false });
        const ok = await GET(req("Bearer secreto-de-prueba"));
        expect(ok.status).toBe(200);
        expect((await ok.json()).inferred).toBe(2);
        runJob.mockRejectedValueOnce(new Error("read_failed"));
        const fail = await GET(req("Bearer secreto-de-prueba"));
        expect(fail.status).toBe(503);
        expect(await fail.json()).toEqual({ error: "job_failed" });
    });
});
