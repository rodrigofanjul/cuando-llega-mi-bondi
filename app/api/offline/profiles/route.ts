import { readFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { profileArtifactSchema, subsetProfile, type ProfileArtifact } from "@features/offline/lib/profiles";
import { RateLimiter, clientKey } from "@/lib/server/rateLimit";
import { withMetrics } from "@/lib/server/metrics";

/**
 * Perfiles para el modo offline, filtrados a los pares pedidos (favoritos/widgets)
 * con checksum recalculado. Requiere OFFLINE_PROFILES_PATH; sin él → 404 y la app
 * usa sólo la frecuencia publicada. Perfiles sintéticos: nunca en producción.
 */
const limiter = new RateLimiter(30, 60_000);
const pairsSchema = z
    .string()
    .max(2000)
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.string().regex(/^[^|,]{1,40}\|[^|,]{1,40}$/)).min(1).max(20));

let cached: { path: string; profile: ProfileArtifact | null } | null = null;

async function load(): Promise<ProfileArtifact | null> {
    const path = process.env.OFFLINE_PROFILES_PATH?.trim();
    if (!path) return null;
    if (cached?.path === path) return cached.profile;
    try {
        const parsed = profileArtifactSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
        cached = { path, profile: parsed.success ? parsed.data : null };
    } catch {
        cached = { path, profile: null };
    }
    return cached.profile;
}

async function handleGET(req: NextRequest) {
    if (!limiter.take(clientKey(req.headers), Date.now())) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const pairs = pairsSchema.safeParse(req.nextUrl.searchParams.get("pairs") ?? "");
    if (!pairs.success) return NextResponse.json({ error: "invalid_pairs" }, { status: 400 });
    const profile = await load();
    if (!profile) return NextResponse.json({ error: "no_profiles" }, { status: 404 });
    const synthetic = profile.data_source !== "real";
    if (synthetic && (process.env.NODE_ENV === "production" || process.env.OFFLINE_ALLOW_SYNTHETIC !== "true")) {
        return NextResponse.json({ error: "no_profiles" }, { status: 404 });
    }
    const subset = await subsetProfile(
        profile,
        pairs.data.map((p) => {
            const [stopId, lineCode] = p.split("|");
            return { stopId, lineCode };
        }),
    );
    return NextResponse.json(subset, { headers: { "Cache-Control": "private, max-age=3600" } });
}

export const GET = withMetrics("/api/offline/profiles GET", handleGET);
