"use client";

import type { Favorito } from "@features/favorites/types";
import { ArrivalTime } from "@features/arrivals/components/ArrivalTime";
import { usePairArrivals } from "@features/home/hooks/usePairArrivals";
import type { CornerGroup } from "@features/home/lib/corners";

import { LineChip } from "./LineChip";

function FavoriteRow({ fav, now, live, onOpen }: { readonly fav: Favorito; readonly now: number; readonly live: boolean; readonly onOpen: (f: Favorito) => void }) {
    const { arrivals, fetchedAt, loaded, stale, loading } = usePairArrivals(fav.identificadorParada, fav.codigoLineaParada, live);
    const at = fetchedAt ?? now;
    const label = fav.lineaLabel ?? fav.descripcionLinea;
    const first = arrivals[0];
    const second = arrivals[1];
    return (
        <button type="button" onClick={() => onOpen(fav)} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
            <LineChip label={label} />
            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">
                {fav.descripcionBandera && fav.descripcionBandera !== "—" ? `→ ${fav.descripcionBandera}` : fav.nombre}
            </span>
            {!loaded ? (
                <span className="text-[13px] text-muted-foreground">{loading ? "…" : "Sin datos"}</span>
            ) : stale ? (
                <span className="text-[13px] text-muted-foreground">Sin datos recientes</span>
            ) : first ? (
                <span className="flex items-baseline gap-2">
                    <ArrivalTime input={{ kind: "live", etaMinutes: first.etaMinutes, arriving: first.status === "arriving", fetchedAt: at, now }} />
                    {second ? <span className="text-[13px] tabular-nums text-muted-foreground">· {second.etaMinutes}</span> : null}
                </span>
            ) : (
                <ArrivalTime input={{ kind: "none", headwayMin: null }} />
            )}
        </button>
    );
}

export function CornerCard({ group, now, liveIds, onOpen }: { readonly group: CornerGroup; readonly now: number; readonly liveIds: ReadonlySet<string>; readonly onOpen: (f: Favorito) => void }) {
    return (
        <section className="rounded-[16px] border border-border bg-card px-4 py-2" aria-label={group.title}>
            <h3 className="pt-1 text-[13px] font-semibold text-muted-foreground">{group.title}</h3>
            <div className="divide-y divide-border">
                {group.favorites.map((f) => (
                    <FavoriteRow key={f.id} fav={f} now={now} live={liveIds.has(f.id)} onOpen={onOpen} />
                ))}
            </div>
        </section>
    );
}
