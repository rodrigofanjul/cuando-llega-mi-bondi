import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
    clusterReports,
    estimateOccupancy,
    expiresAt,
    moderateText,
    reportSubmissionSchema,
    reputationWeight,
} from "@features/reports/lib/reports";
import { RateLimiter, clientKey } from "@/lib/server/rateLimit";
import { activeReports, insertReport, reporterHash, reportsConfigured, reputationWeights } from "@/lib/server/reportsRepo";

/**
 * Reportes colaborativos.
 * POST: crea un reporte (validado, moderado, con caducidad). Límites por IP y por dispositivo.
 * GET:  devuelve SÓLO agregados (≥ 2 personas) y ocupación estimada; nunca reportes individuales.
 * Sin REPORTS_SALT o sin Supabase configurado → 503 (la UI oculta la función).
 */
const perIp = new RateLimiter(10, 10 * 60_000);
const perDevice = new RateLimiter(5, 10 * 60_000);
const readLimiter = new RateLimiter(120, 60_000);

const getSchema = z.object({ lineCode: z.string().trim().min(1).max(40), stopId: z.string().trim().max(40).optional() });

export async function POST(req: NextRequest) {
    if (!reportsConfigured()) return NextResponse.json({ error: "reports_unavailable" }, { status: 503 });
    const now = Date.now();
    if (!perIp.take(clientKey(req.headers), now)) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "600" } });
    }
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = reportSubmissionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    const r = parsed.data;
    const hash = reporterHash(r.deviceId);
    if (!perDevice.take(hash, now)) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "600" } });
    }
    const moderation = moderateText(r.text);
    try {
        await insertReport(
            {
                type: r.type,
                lineCode: r.lineCode,
                stopId: r.stopId,
                occupancy: r.occupancy,
                text: r.text,
                reporterHash: hash,
                status: moderation.status,
                createdAt: now,
                expiresAt: expiresAt(r.type, now),
            },
            moderation.reason,
        );
    } catch {
        console.error("[reports] insert failed");
        return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ accepted: true, status: moderation.status }, { status: 201 });
}

export async function GET(req: NextRequest) {
    if (!reportsConfigured()) return NextResponse.json({ error: "reports_unavailable" }, { status: 503 });
    const now = Date.now();
    if (!readLimiter.take(clientKey(req.headers), now)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const parsed = getSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });
    const { lineCode, stopId } = parsed.data;
    try {
        const reports = await activeReports(lineCode, now);
        const rep = await reputationWeights([...new Set(reports.map((r) => r.reporterHash))]);
        const weights = new Map([...rep].map(([h, v]) => [h, reputationWeight(v.corroborated, v.total)]));
        const clusters = clusterReports(reports, now, weights)
            .filter((c) => !stopId || c.stopId === null || c.stopId === stopId)
            .map(({ type, stopId: s, reporters, lastAt, label, confirmed }) => ({ type, stopId: s, reporters, lastAt, label, confirmed }));
        return NextResponse.json(
            { lineCode, clusters, occupancy: estimateOccupancy(reports, lineCode, now, weights), generatedAt: now },
            { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } },
        );
    } catch {
        console.error("[reports] read failed");
        return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
    }
}
