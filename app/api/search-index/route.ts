import { connection, NextResponse } from "next/server";

import { buildSearchIndex } from "@features/search/lib/searchIndex";
import { getTransitStaticModels } from "@/lib/server/transitStaticModels";

/** Índice compacto para la búsqueda local (sólo datos de referencia, sin consultas en vivo). */
export async function GET() {
    // Cache Components: sin esto la ruta se prerenderiza en el build y `new Date()` rompe.
    await connection();
    const { paradas } = await getTransitStaticModels();
    if (paradas.length === 0) return NextResponse.json({ error: "catalogo_no_disponible" }, { status: 503 });
    const index = buildSearchIndex(paradas, new Date().toISOString().slice(0, 10));
    return NextResponse.json(index, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } });
}
