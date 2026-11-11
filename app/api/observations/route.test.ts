import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const insert = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/server/supabaseAdmin", () => ({
    createAdminClient: () => ({ from: () => ({ insert }) }),
}));

const { POST } = await import("./route");

function observation(at = Date.now()) {
    return {
        observedAt: at,
        stopId: "P1",
        lineCode: "531",
        rawLineCode: null,
        destination: "A CENTRO",
        vehicleId: "C1",
        etaMinutes: 5,
        etaStatus: "minutes",
        rawEta: "5 min. aprox.",
        deviationMinutes: null,
        gpsAt: null,
        origin: "user_query",
    };
}

function request(body: unknown, ip = "9.9.9.9") {
    return new NextRequest("http://localhost/api/observations", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

describe("POST /api/observations", () => {
    beforeEach(() => insert.mockClear());
    afterEach(() => vi.unstubAllEnvs());

    it("deshabilitada por defecto: valida pero no guarda", async () => {
        const res = await POST(request({ observations: [observation()] }, "1.1.1.1"));
        expect(res.status).toBe(202);
        expect(await res.json()).toEqual({ accepted: false, reason: "ingest_disabled" });
        expect(insert).not.toHaveBeenCalled();
    });

    it("rechaza JSON inválido y payloads fuera de contrato", async () => {
        expect((await POST(request("{roto", "2.2.2.2"))).status).toBe(400);
        expect((await POST(request({ observations: [{ ...observation(), origin: "scraper" }] }, "2.2.2.3"))).status).toBe(400);
    });

    it("habilitada: guarda filas válidas y descarta relojes absurdos", async () => {
        vi.stubEnv("OBSERVATIONS_INGEST_ENABLED", "true");
        const res = await POST(request({ appVersion: "0.1.0", observations: [observation(), observation(Date.now() - 3_600_000)] }, "3.3.3.3"));
        expect(await res.json()).toEqual({ accepted: true, stored: 1 });
        expect(insert).toHaveBeenCalledOnce();
    });

    it("limita requests por IP", async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 31; i++) statuses.push((await POST(request({ observations: [observation()] }, "4.4.4.4"))).status);
        expect(statuses.at(-1)).toBe(429);
        expect(statuses.slice(0, 30).every((s) => s === 202)).toBe(true);
    });
});
