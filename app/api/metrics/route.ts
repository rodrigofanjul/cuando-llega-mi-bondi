import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse, connection } from "next/server";

import { snapshot } from "@/lib/server/metrics";

/**
 * Métricas de la instancia (latencia, errores y contadores sin datos personales).
 * Requiere `Authorization: Bearer <METRICS_TOKEN>`. Sin METRICS_TOKEN configurado → 404.
 */
function authorized(req: NextRequest): boolean {
    const token = process.env.METRICS_TOKEN?.trim();
    const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token || given.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(token));
}

export async function GET(req: NextRequest) {
    // Sin esto Next la prerenderiza en el build (Cache Components) y serviría un snapshot fijo.
    await connection();
    if (!process.env.METRICS_TOKEN?.trim()) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    return NextResponse.json(snapshot(), { headers: { "Cache-Control": "no-store" } });
}
