import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import fixture from "./__fixtures__/profiles-synthetic.json";
import { profileArtifactSchema, type ProfileArtifact } from "./profiles";
import {
    arDayIndex,
    buildOfflineWidgetTable,
    lookupOfflineTable,
    matchesEngine,
    OFFLINE_HORIZON_DAYS,
    type OfflineHint,
    type OfflineWidgetTable,
} from "./widgetTable";

const profile: ProfileArtifact = profileArtifactSchema.parse(fixture.profile);
const WED_0807 = Date.parse("2026-11-11T11:07:00Z");
const MIN = 60_000;
const DAY = 86_400_000;
const PAIRS = [
    { stopId: "A-S1", lineCode: "A" },
    { stopId: "X", lineCode: "A" },
];
const VECTORS = resolve(__dirname, "../../../shared/contracts/offline-vectors.json");

/** Casos que Kotlin y Swift reproducen (días antes, dentro y fuera del horizonte). */
function buildVectors(table: OfflineWidgetTable) {
    const times = ["00:00", "05:31", "06:44", "07:59", "08:07", "12:00", "18:44", "23:59"];
    const cases: { stopId: string; lineCode: string; now: number; expected: OfflineHint | null }[] = [];
    for (let d = -1; d <= OFFLINE_HORIZON_DAYS; d++) {
        for (const t of times) {
            const [h, m] = t.split(":").map(Number);
            const now = (table.firstDay + d) * DAY + 3 * 60 * MIN + (h * 60 + m) * MIN;
            cases.push({ stopId: "A-S1", lineCode: "A", now, expected: lookupOfflineTable(table, "A-S1", "A", now) });
        }
    }
    cases.push({ stopId: "X", lineCode: "A", now: WED_0807, expected: null });
    return { comment: "Generado por features/offline/lib/widgetTable.test.ts (perfil SINTÉTICO). UPDATE_VECTORS=1 para regenerar.", table, cases };
}

describe("tabla offline para widgets", () => {
    const table = buildOfflineWidgetTable(profile, PAIRS, WED_0807, WED_0807);

    it("sólo incluye pares con perfil y resuelve el tipo de día del horizonte", () => {
        expect(Object.keys(table.entries)).toEqual(["A-S1|A"]);
        expect(table.firstDay).toBe(arDayIndex(WED_0807));
        expect(table.dayTypes).toHaveLength(OFFLINE_HORIZON_DAYS);
        // 11/11/2026 es miércoles: mié, jue, vie, sáb, dom, lun…
        expect(table.dayTypes.slice(0, 6)).toEqual(["weekday", "weekday", "weekday", "saturday", "sunday_holiday", "weekday"]);
        expect(table.dataSource).toBe("synthetic");
    });

    it("responde igual que el motor web cada 5 min durante todo el horizonte", () => {
        let checked = 0;
        for (let t = WED_0807; t < WED_0807 + OFFLINE_HORIZON_DAYS * DAY - DAY; t += 5 * MIN) {
            expect(matchesEngine(profile, table, "A-S1", "A", t)).toBe(true);
            checked++;
        }
        expect(checked).toBeGreaterThan(3500);
    });

    it("no estima fuera del horizonte ni antes de la sincronización", () => {
        expect(lookupOfflineTable(table, "A-S1", "A", WED_0807 + OFFLINE_HORIZON_DAYS * DAY)).toBeNull();
        expect(lookupOfflineTable(table, "A-S1", "A", WED_0807 - DAY)).toBeNull();
        expect(lookupOfflineTable(table, "X", "A", WED_0807)).toBeNull();
    });

    it("feriado inamovible dentro del horizonte usa el perfil de domingo/feriado", () => {
        const dec1 = Date.parse("2026-12-01T15:00:00Z");
        const t = buildOfflineWidgetTable(profile, PAIRS, dec1, dec1);
        const dec8 = arDayIndex(Date.parse("2026-12-08T15:00:00Z")) - t.firstDay;
        expect(t.dayTypes[dec8]).toBe("sunday_holiday");
    });

    it("los vectores compartidos con Kotlin/Swift están al día", () => {
        const vectors = buildVectors(table);
        if (process.env.UPDATE_VECTORS === "1") writeFileSync(VECTORS, `${JSON.stringify(vectors, null, 1)}\n`);
        expect(JSON.parse(readFileSync(VECTORS, "utf8"))).toEqual(JSON.parse(JSON.stringify(vectors)));
        expect(vectors.cases.filter((c) => c.expected).length).toBeGreaterThan(20);
        expect(vectors.cases.filter((c) => !c.expected).length).toBeGreaterThan(10);
    });
});
