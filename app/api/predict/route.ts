import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { predict } from "@features/prediction/lib/model";
import { loadPredictionModel } from "@/lib/server/predictionModel";
import { RateLimiter, clientKey } from "@/lib/server/rateLimit";

/**
 * Inferencia de ETA corregido (Fase 5). Devuelve SIEMPRE el ETA oficial y, sólo
 * si hay un modelo publicable entrenado con datos reales, la corrección con
 * intervalo, versión y timestamp. Sin modelo → fallback al oficial.
 *
 * Variables: PREDICTION_MODEL_PATH (artefacto JSON del pipeline ml/).
 * PREDICTION_ALLOW_SYNTHETIC=true sólo fuera de producción (pruebas).
 */
const limiter = new RateLimiter(120, 60_000);

const querySchema = z.object({
    stopId: z.string().trim().min(1).max(40),
    lineCode: z.string().trim().min(1).max(40),
    eta: z.coerce.number().int().min(0).max(600),
    deviation: z.coerce.number().int().min(-600).max(600).optional(),
});

export async function GET(req: NextRequest) {
    if (!limiter.take(clientKey(req.headers), Date.now())) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    const q = parsed.data;
    const now = Date.now();
    const allowSynthetic = process.env.NODE_ENV !== "production" && process.env.PREDICTION_ALLOW_SYNTHETIC === "true";
    const result = predict(
        await loadPredictionModel(),
        { officialEtaMinutes: q.eta, observedAt: now, lineCode: q.lineCode, stopId: q.stopId, deviationMinutes: q.deviation ?? null },
        { now, allowSynthetic },
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
