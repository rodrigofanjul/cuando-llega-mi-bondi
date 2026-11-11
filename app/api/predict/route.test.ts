import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { resetPredictionModelCache } from "@/lib/server/predictionModel";

import { GET } from "./route";

const FIXTURE = fileURLToPath(new URL("../../../features/prediction/lib/__fixtures__/model-synthetic.json", import.meta.url));

const req = (qs: string, ip = "5.5.5.5") =>
    new NextRequest(`http://localhost/api/predict?${qs}`, { headers: { "x-forwarded-for": ip } });

describe("GET /api/predict", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        resetPredictionModelCache();
    });

    it("sin modelo configurado devuelve el ETA oficial", async () => {
        const res = await GET(req("stopId=P1&lineCode=531&eta=10"));
        expect(await res.json()).toMatchObject({ officialEtaMinutes: 10, correctedEtaMinutes: null, quality: "official", fallbackReason: "no_model" });
    });

    it("artefacto sintético: no se usa salvo flag explícito fuera de producción", async () => {
        vi.stubEnv("PREDICTION_MODEL_PATH", FIXTURE);
        expect(await (await GET(req("stopId=L1-S1&lineCode=L1&eta=10", "5.5.5.6"))).json()).toMatchObject({ fallbackReason: "synthetic_data" });

        vi.stubEnv("PREDICTION_ALLOW_SYNTHETIC", "true");
        const body = await (await GET(req("stopId=L1-S1&lineCode=L1&eta=10", "5.5.5.7"))).json();
        expect(body.quality).toBe("model");
        expect(body.modelVersion).toBe("fixture-synthetic");

        vi.stubEnv("NODE_ENV", "production");
        expect(await (await GET(req("stopId=L1-S1&lineCode=L1&eta=10", "5.5.5.8"))).json()).toMatchObject({ fallbackReason: "synthetic_data" });
    });

    it("artefacto ilegible → fallback sin romper", async () => {
        vi.stubEnv("PREDICTION_MODEL_PATH", "/no/existe.json");
        expect(await (await GET(req("stopId=P1&lineCode=531&eta=5", "5.5.5.9"))).json()).toMatchObject({ fallbackReason: "no_model" });
    });

    it("valida parámetros", async () => {
        expect((await GET(req("stopId=&lineCode=531&eta=5", "6.6.6.1"))).status).toBe(400);
        expect((await GET(req("stopId=P1&lineCode=531&eta=abc", "6.6.6.2"))).status).toBe(400);
    });
});
