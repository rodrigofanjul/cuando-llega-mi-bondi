import { describe, expect, it } from "vitest";

import { inferBatch, planWindow, type ObservationDbRow } from "./inferJob";

const MIN = 60_000;
const T0 = Date.parse("2026-11-11T12:00:00Z");

/** Una unidad que se acerca y llega cada 12 min, consultada cada 2 min (como el mock). */
function series(stop: string, line: string, from: number, to: number): ObservationDbRow[] {
    const rows: ObservationDbRow[] = [];
    for (let t = from; t < to; t += 2 * MIN) {
        const eta = (12 - (Math.floor((t - from) / MIN) % 12)) % 12;
        rows.push({
            observed_at: new Date(t).toISOString(),
            stop_id: stop,
            line_code: line,
            vehicle_id: "C1",
            eta_minutes: eta,
            eta_status: eta === 0 ? "arriving" : "minutes",
        });
    }
    return rows;
}

describe("inferBatch", () => {
    it("guarda sólo llegadas de la zona central de la ventana", () => {
        const now = T0 + 3 * 60 * MIN;
        const w = planWindow(now);
        const r = inferBatch(series("P1", "531", T0, now), w);
        expect(r.series).toBe(1);
        expect(r.rows.length).toBeGreaterThan(5);
        for (const row of r.rows) {
            const at = Date.parse(row.arrived_at);
            expect(at).toBeGreaterThanOrEqual(w.keepFrom);
            expect(at).toBeLessThan(w.keepTo);
            expect(row.algorithm_version).toBe("infer-v1");
        }
    });

    it("dos corridas solapadas producen filas idénticas (el UNIQUE descarta repetidas)", () => {
        const all = series("P1", "531", T0, T0 + 5 * 60 * MIN);
        const a = inferBatch(all.filter((o) => Date.parse(o.observed_at) < T0 + 3 * 60 * MIN), planWindow(T0 + 3 * 60 * MIN));
        const b = inferBatch(all.filter((o) => Date.parse(o.observed_at) < T0 + 3.5 * 60 * MIN), planWindow(T0 + 3.5 * 60 * MIN));
        const key = (r: { arrived_at: string; vehicle_id: string }) => `${r.vehicle_id}@${r.arrived_at}`;
        const shared = b.rows.filter((r) => Date.parse(r.arrived_at) < planWindow(T0 + 3 * 60 * MIN).keepTo);
        expect(shared.length).toBeGreaterThan(0);
        for (const r of shared) expect(a.rows.map(key)).toContain(key(r));
    });

    it("separa series por parada y línea y cuenta unidades sin identificador", () => {
        const now = T0 + 3 * 60 * MIN;
        const anon = series("P2", "573", T0, now).map((o) => ({ ...o, vehicle_id: null }));
        const r = inferBatch([...series("P1", "531", T0, now), ...anon], planWindow(now));
        expect(r.series).toBe(2);
        expect(r.untracked).toBe(anon.length);
        expect(r.rows.every((x) => x.stop_id === "P1")).toBe(true);
    });

    it("ignora filas fuera de la ventana de lectura o con fecha inválida", () => {
        const now = T0 + 3 * 60 * MIN;
        const old = series("P9", "1", T0 - 10 * 60 * MIN, T0 - 6 * 60 * MIN);
        const bad = [{ ...old[0], observed_at: "no-es-fecha" }];
        expect(inferBatch([...old, ...bad], planWindow(now)).series).toBe(0);
    });
});
