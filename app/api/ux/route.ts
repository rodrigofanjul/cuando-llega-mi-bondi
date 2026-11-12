import { NextRequest, NextResponse } from "next/server";

import { sanitizeMissQuery, uxEventSchema } from "@features/home/lib/uxMetrics";
import { increment, logEvent, withMetrics } from "@/lib/server/metrics";
import { RateLimiter, clientKey } from "@/lib/server/rateLimit";

/**
 * Métricas de experiencia anónimas (apagadas por defecto): sólo contadores
 * agregados y, para búsquedas sin resultado, texto normalizado sin números largos.
 */
const limiter = new RateLimiter(60, 60_000);
const MAX_BODY = 2048;

async function handlePost(req: NextRequest) {
    if (process.env.NEXT_PUBLIC_UX_METRICS_ENABLED !== "true") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!limiter.take(clientKey(req.headers), Date.now())) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const text = await req.text();
    if (text.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const parsed = uxEventSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

    const ev = parsed.data;
    switch (ev.type) {
        case "time_to_minutes":
            increment(`ux.time_to_minutes.${ev.ms < 1000 ? "lt1s" : ev.ms <= 3000 ? "1to3s" : "gt3s"}`);
            break;
        case "taps_to_minutes":
            increment(`ux.taps.${ev.taps >= 5 ? "5plus" : ev.taps}`);
            break;
        case "search_miss": {
            increment("ux.search_miss");
            const q = sanitizeMissQuery(ev.q);
            if (q) logEvent("ux_search_miss", { q });
            break;
        }
        case "quick_alert":
            increment("ux.quick_alert");
            break;
    }
    return new NextResponse(null, { status: 204 });
}

export const POST = withMetrics("/api/ux POST", handlePost);
