import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/profiles-synthetic.json";
import {
    acceptProfile,
    canonicalJson,
    checksumOf,
    estimateOffline,
    offlineDayType,
    profileArtifactSchema,
    resolveOfflineState,
    scheduledHeadway,
    subsetProfile,
    type ProfileArtifact,
} from "./profiles";

const profile: ProfileArtifact = profileArtifactSchema.parse(fixture.profile);
const cases = fixture.cases as { stop: string; line: string; epoch: number; expected: [number, number, number] | null }[];
const WED_0807 = Date.parse("2026-11-11T11:07:00Z");

describe("paridad con Python (perfil SINTÉTICO)", () => {
    it("el checksum canónico coincide con el calculado en Python", async () => {
        expect(await checksumOf(profile.entries)).toBe(profile.sha256);
    });

    it.each(cases.map((c, i) => [i, c] as const))("caso %i: misma estimación", (_i, c) => {
        const est = estimateOffline(profile, c.stop, c.line, c.epoch);
        expect(est ? [est.waitMedianMin, est.waitLowMin, est.waitHighMin] : null).toEqual(c.expected);
    });

    it("hay casos con y sin soporte", () => {
        expect(cases.some((c) => c.expected)).toBe(true);
        expect(cases.some((c) => !c.expected)).toBe(true);
    });
});

describe("tipos de día y JSON canónico", () => {
    it("feriado inamovible cuenta como domingo", () => {
        expect(offlineDayType(Date.parse("2026-07-09T12:00:00Z"))).toBe("sunday_holiday");
        expect(offlineDayType(Date.parse("2026-11-14T12:00:00Z"))).toBe("saturday");
        expect(offlineDayType(WED_0807)).toBe("weekday");
    });

    it("ordena claves y no agrega espacios", () => {
        expect(canonicalJson({ b: [1, { d: 2, c: "á" }], a: 8 })).toBe('{"a":8,"b":[1,{"c":"á","d":2}]}');
    });
});

describe("estados (§24)", () => {
    const base = { profile, freqs: { A: [{ start: 0, end: 1440, headwayMin: 12 }] }, stopId: "A-S1", lineCode: "A", lineLabel: "A" };

    it("ONLINE no usa el histórico", () => {
        expect(resolveOfflineState({ ...base, online: true, now: WED_0807 })).toEqual({ state: "ONLINE" });
    });

    it("OFFLINE CON MODELO: estimación con rango, rótulo histórico y fecha de sincronización", () => {
        const s = resolveOfflineState({ ...base, online: false, now: WED_0807 });
        expect(s.state).toBe("OFFLINE_MODEL");
        if (s.state === "OFFLINE_MODEL") {
            expect(s.label).toBe("Estimación histórica — sin seguimiento GPS en tiempo real");
            expect(s.estimate.waitLowMin).toBe(0);
            expect(s.estimate.waitHighMin).toBeGreaterThanOrEqual(s.estimate.waitMedianMin);
            expect(s.syncedAt).toBe(profile.generated_at);
        }
    });

    it("OFFLINE SIN DATOS: no inventa minutos; muestra frecuencia publicada si existe", () => {
        const s = resolveOfflineState({ ...base, stopId: "X", online: false, now: WED_0807 });
        expect(s).toMatchObject({ state: "OFFLINE_INSUFFICIENT", scheduledHeadwayMin: 12 });
        expect("estimate" in s).toBe(false);
        expect(resolveOfflineState({ ...base, stopId: "X", freqs: null, online: false, now: WED_0807 })).toMatchObject({ scheduledHeadwayMin: null });
    });

    it("frecuencia por franja horaria", () => {
        const f = { "531": [{ start: 360, end: 600, headwayMin: 10 }, { start: 600, end: 1200, headwayMin: 15 }] };
        expect(scheduledHeadway(f, "531", WED_0807)).toBe(10);
        expect(scheduledHeadway(f, "531", Date.parse("2026-11-11T05:00:00Z"))).toBeNull();
    });
});

describe("sincronización", () => {
    it("acepta versiones válidas y conserva la anterior", async () => {
        const s1 = await acceptProfile({ current: null, previous: null, lastError: null }, fixture.profile);
        expect(s1.current?.profile_version).toBe("fixture-offline");
        const v2 = { ...fixture.profile, profile_version: "v2", entries: {}, sha256: await checksumOf({}) };
        const s2 = await acceptProfile(s1, v2);
        expect(s2.current?.profile_version).toBe("v2");
        expect(s2.previous?.profile_version).toBe("fixture-offline");
    });

    it("rechaza checksum inválido o esquema desconocido sin perder la versión buena", async () => {
        const good = await acceptProfile({ current: null, previous: null, lastError: null }, fixture.profile);
        const tampered = { ...fixture.profile, entries: { ...fixture.profile.entries, "Z|Z": {} } };
        const r1 = await acceptProfile(good, tampered);
        expect(r1.current).toBe(good.current);
        expect(r1.lastError).toBe("Checksum no coincide");
        const r2 = await acceptProfile(good, { ...fixture.profile, schema_version: 2 });
        expect(r2.current).toBe(good.current);
        expect(r2.lastError).toMatch(/inválido/);
    });

    it("subconjunto por favoritos con checksum recalculado", async () => {
        const sub = await subsetProfile(profile, [{ stopId: "A-S1", lineCode: "A" }, { stopId: "nope", lineCode: "A" }]);
        expect(Object.keys(sub.entries)).toEqual(["A-S1|A"]);
        expect(await checksumOf(sub.entries)).toBe(sub.sha256);
        expect((await subsetProfile(profile, [])).entries).toEqual({});
    });
});
