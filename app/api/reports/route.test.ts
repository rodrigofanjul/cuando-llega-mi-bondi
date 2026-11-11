import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import type { StoredReport } from "@features/reports/lib/reports";

const stored: StoredReport[] = [];
vi.mock("@/lib/server/reportsRepo", () => ({
    reportsConfigured: () => process.env.REPORTS_SALT === "test-salt",
    reporterHash: (d: string) => d.padEnd(64, "0").slice(0, 64),
    insertReport: vi.fn(async (r: Omit<StoredReport, "id">) => void stored.push({ ...r, id: `id${stored.length}` })),
    activeReports: vi.fn(async (line: string, now: number) => stored.filter((r) => r.lineCode === line && r.status === "approved" && r.expiresAt > now)),
    reputationWeights: vi.fn(async () => new Map()),
}));

const { GET, POST } = await import("./route");

const post = (body: unknown, ip = "1.1.1.1") =>
    POST(new NextRequest("http://localhost/api/reports", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = (qs: string, ip = "2.2.2.2") => GET(new NextRequest(`http://localhost/api/reports?${qs}`, { headers: { "x-forwarded-for": ip } }));

const device = (n: number) => `device-${String(n).padStart(12, "0")}`;

describe("/api/reports", () => {
    beforeEach(() => {
        stored.length = 0;
        vi.stubEnv("REPORTS_SALT", "test-salt");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("sin configuración responde 503", async () => {
        vi.stubEnv("REPORTS_SALT", "");
        expect((await post({})).status).toBe(503);
        expect((await get("lineCode=531")).status).toBe(503);
    });

    it("crea reportes válidos con caducidad y modera textos", async () => {
        const ok = await post({ type: "demora", lineCode: "531", stopId: "P1", deviceId: device(1) }, "10.0.0.1");
        expect(ok.status).toBe(201);
        expect(await ok.json()).toEqual({ accepted: true, status: "approved" });
        const mod = await post({ type: "desvio", lineCode: "531", stopId: "P1", deviceId: device(2), text: "info en www.spam.com" }, "10.0.0.2");
        expect(await mod.json()).toEqual({ accepted: true, status: "pending" });
        expect(stored[0].expiresAt - stored[0].createdAt).toBe(45 * 60_000);
        expect(stored[0]).not.toHaveProperty("deviceId");
    });

    it("rechaza payloads inválidos", async () => {
        expect((await post({ type: "ocupacion", lineCode: "531", deviceId: device(3) }, "10.0.0.3")).status).toBe(400);
    });

    it("limita por dispositivo aunque cambie la IP", async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) statuses.push((await post({ type: "demora", lineCode: "531", stopId: "P1", deviceId: device(9) }, `10.1.0.${i}`)).status);
        expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
        expect(statuses[5]).toBe(429);
    });

    it("GET sólo devuelve agregados de 2+ personas y nunca hashes", async () => {
        await post({ type: "demora", lineCode: "531", stopId: "P1", deviceId: device(20) }, "10.2.0.1");
        let body = await (await get("lineCode=531&stopId=P1", "20.0.0.1")).json();
        expect(body.clusters).toEqual([]);
        await post({ type: "demora", lineCode: "531", stopId: "P1", deviceId: device(21) }, "10.2.0.2");
        await post({ type: "ocupacion", lineCode: "531", occupancy: "alta", deviceId: device(20) }, "10.2.0.3");
        await post({ type: "ocupacion", lineCode: "531", occupancy: "alta", deviceId: device(21) }, "10.2.0.4");
        body = await (await get("lineCode=531&stopId=P1", "20.0.0.2")).json();
        expect(body.clusters).toHaveLength(1);
        expect(body.clusters[0]).toMatchObject({ type: "demora", reporters: 2, confirmed: false });
        expect(body.occupancy).toMatchObject({ level: "alta", reporters: 2 });
        expect(JSON.stringify(body)).not.toMatch(/reporterHash|device-/);
    });
});
