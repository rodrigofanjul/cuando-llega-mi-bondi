import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { withMetrics, logEvent } from "@/lib/server/metrics";
import { runInferArrivalsJob } from "@/lib/server/inferArrivalsJob";
import { createAdminClient } from "@/lib/server/supabaseAdmin";

/**
 * Llegadas inferidas a partir de observaciones ya guardadas (cada 30 min desde
 * un scheduler, p. ej. Vercel Cron). No consulta al proveedor de datos.
 * Requiere `CRON_SECRET` (Authorization: Bearer …); sin él la ruta no existe.
 */
function authorized(req: NextRequest, secret: string): boolean {
    const got = Buffer.from(req.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${secret}`);
    return got.length === want.length && timingSafeEqual(got, want);
}

async function handleGET(req: NextRequest) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!authorized(req, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    try {
        const report = await runInferArrivalsJob(createAdminClient(), Date.now());
        logEvent("infer_arrivals", { ...report });
        return NextResponse.json(report);
    } catch (err) {
        logEvent("infer_arrivals_failed", { reason: err instanceof Error ? err.message : "unknown" });
        return NextResponse.json({ error: "job_failed" }, { status: 503 });
    }
}

export const GET = withMetrics("/api/cron/infer-arrivals GET", handleGET);
