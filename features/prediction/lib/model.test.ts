import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/model-synthetic.json";
import { artifactSchema, buildFeatures, evaluateTrees, predict, rawPrediction, type ModelArtifact } from "./model";

const artifact: ModelArtifact = artifactSchema.parse(fixture);

interface ParityCase {
    x: number[];
    eta: number;
    expected: number;
    raw: { observed_at: number; line_code: string; stop_id: string; deviation_minutes: number };
}
const cases = artifact.parity_cases as ParityCase[];

describe("paridad con Python (artefacto SINTÉTICO de fixture)", () => {
    it("el fixture es sintético y no publicable", () => {
        expect(artifact.data_source).toBe("synthetic");
        expect(artifact.gate.publishable).toBe(false);
        expect(cases.length).toBeGreaterThan(10);
    });

    it.each(cases.map((c, i) => [i, c] as const))("caso %i: variables idénticas a dataset.add_features", (_i, c) => {
        const x = buildFeatures(
            { officialEtaMinutes: c.eta, observedAt: c.raw.observed_at, lineCode: c.raw.line_code, stopId: c.raw.stop_id, deviationMinutes: c.raw.deviation_minutes },
            artifact.maps,
        );
        x.forEach((v, j) => expect(v).toBeCloseTo(c.x[j], 9));
    });

    it.each(cases.map((c, i) => [i, c] as const))("caso %i: predicción idéntica a LightGBM", (_i, c) => {
        const viaTrees = Math.max(0, c.eta + evaluateTrees(artifact.trees ?? [], c.x));
        expect(viaTrees).toBeCloseTo(c.expected, 9);
        const viaInputs = rawPrediction(artifact, {
            officialEtaMinutes: c.eta,
            observedAt: c.raw.observed_at,
            lineCode: c.raw.line_code,
            stopId: c.raw.stop_id,
            deviationMinutes: c.raw.deviation_minutes,
        });
        expect(viaInputs).toBeCloseTo(c.expected, 9);
    });
});

describe("predict (política de uso)", () => {
    const input = { officialEtaMinutes: 10, observedAt: Date.parse("2026-11-11T11:00:00Z"), lineCode: "L1", stopId: "L1-S1", deviationMinutes: 0 };
    const now = 1;

    it("sin modelo → ETA oficial", () => {
        expect(predict(null, input, { now })).toMatchObject({ quality: "official", correctedEtaMinutes: null, fallbackReason: "no_model" });
    });

    it("modelo sintético → nunca se usa en producción", () => {
        expect(predict(artifact, input, { now })).toMatchObject({ quality: "official", fallbackReason: "synthetic_data" });
    });

    it("modelo real no publicable → fallback", () => {
        const real = { ...artifact, data_source: "real" };
        expect(predict(real, input, { now })).toMatchObject({ quality: "official", fallbackReason: "not_publishable" });
    });

    it("modelo real publicable → corrección con intervalo y versión", () => {
        const ok = { ...artifact, data_source: "real", gate: { publishable: true, reasons: [] } };
        const r = predict(ok, input, { now: 123 });
        expect(r.quality).toBe("model");
        expect(r.modelVersion).toBe("fixture-synthetic");
        expect(r.computedAt).toBe(123);
        expect(r.interval!.low).toBeLessThanOrEqual(r.correctedEtaMinutes!);
        expect(r.interval!.high).toBeGreaterThanOrEqual(r.correctedEtaMinutes!);
    });

    it("ETA fuera del rango de entrenamiento → fallback", () => {
        const ok = { ...artifact, data_source: "real", gate: { publishable: true, reasons: [] } };
        expect(predict(ok, { ...input, officialEtaMinutes: 90 }, { now })).toMatchObject({ fallbackReason: "eta_out_of_range" });
    });

    it("línea/parada desconocidas se codifican como -1 (igual que Python)", () => {
        const x = buildFeatures({ ...input, lineCode: "ZZZ", stopId: "nope" }, artifact.maps);
        expect(x[6]).toBe(-1);
        expect(x[7]).toBe(-1);
    });
});
