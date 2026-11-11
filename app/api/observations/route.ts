import { NextRequest, NextResponse } from "next/server";

import { observationBatchSchema, toDbRow } from "@features/observations/lib/observations";
import { createAdminClient } from "@/lib/server/supabaseAdmin";
import { RateLimiter, clientKey } from "@/lib/server/rateLimit";

/**
 * Ingesta de observaciones de arribos (Fase 4).
 *
 * DESHABILITADA por defecto: sólo guarda si `OBSERVATIONS_INGEST_ENABLED=true`
 * en el servidor, que debe activarse recién con la autorización escrita de
 * uso de datos (docs/blockers.md B1). Mientras tanto responde 202 sin guardar.
 *
 * - Validación estricta con zod (máx. 50 observaciones por request).
 * - Rate limit por IP en memoria (la IP no se guarda).
 * - Sin datos personales en las filas (ver migración arrival_observations).
 */
const limiter = new RateLimiter(30, 60_000);
const MAX_BODY_BYTES = 64 * 1024;

function ingestEnabled(): boolean {
    return process.env.OBSERVATIONS_INGEST_ENABLED?.trim().toLowerCase() === "true";
}

export async function POST(req: NextRequest) {
    if (!limiter.take(clientKey(req.headers), Date.now())) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
    }
    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = observationBatchSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    if (!ingestEnabled()) {
        return NextResponse.json({ accepted: false, reason: "ingest_disabled" }, { status: 202 });
    }

    // Descarta observaciones con reloj del cliente absurdo (±10 min del servidor o futuras).
    const now = Date.now();
    const rows = parsed.data.observations
        .filter((o) => Math.abs(now - o.observedAt) <= 10 * 60_000)
        .map((o) => toDbRow(o, parsed.data.appVersion ?? null));
    if (rows.length === 0) {
        return NextResponse.json({ accepted: true, stored: 0 }, { status: 202 });
    }

    try {
        const { error } = await createAdminClient().from("arrival_observations").insert(rows);
        if (error) throw error;
    } catch {
        // Sin detalles al cliente ni datos de la request en logs.
        console.error("[observations] insert failed");
        return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ accepted: true, stored: rows.length }, { status: 202 });
}
