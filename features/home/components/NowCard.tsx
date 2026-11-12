"use client";

import { useEffect } from "react";

import type { Favorito } from "@features/favorites/types";
import { ArrivalTime } from "@features/arrivals/components/ArrivalTime";
import { projectEtaMinutes } from "@features/arrivals/lib/freshness";
import { usePairArrivals } from "@features/home/hooks/usePairArrivals";

import { reportFirstMinutes } from "@features/home/lib/uxMetrics";

import { LineChip } from "./LineChip";

export function NowCard({ fav, reason, now, onOpen }: { readonly fav: Favorito; readonly reason: "habit" | "near"; readonly now: number; readonly onOpen: (f: Favorito) => void }) {
    const { arrivals, fetchedAt, stale } = usePairArrivals(fav.identificadorParada, fav.codigoLineaParada, true);
    const first = arrivals[0];
    const secondEta = fetchedAt !== null && arrivals[1] ? projectEtaMinutes(arrivals[1].etaMinutes, fetchedAt, now) : null;
    const hasLive = fetchedAt !== null && !stale && first !== undefined;
    useEffect(() => {
        if (hasLive) reportFirstMinutes();
    }, [hasLive]);
    return (
        <button type="button" onClick={() => onOpen(fav)} className="w-full rounded-[20px] border border-border bg-card p-4 text-left shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">
                Ahora · {reason === "habit" ? "a esta hora solés ir" : "cerca tuyo"}
            </p>
            <div className="mt-2 flex items-center gap-2">
                <LineChip label={fav.lineaLabel ?? fav.descripcionLinea} />
                <span className="truncate text-[15px] font-semibold">{fav.nombre}</span>
            </div>
            <div className="mt-3 flex items-end justify-between">
                {fetchedAt !== null && !stale && first ? (
                    <ArrivalTime size="hero" input={{ kind: "live", etaMinutes: first.etaMinutes, arriving: first.status === "arriving", fetchedAt, now }} />
                ) : (
                    <span className="text-[15px] text-muted-foreground">{fetchedAt === null ? "Cargando…" : stale ? "Sin datos recientes" : "Sin arribos ahora"}</span>
                )}
                {!stale && secondEta !== null ? <span className="text-[17px] tabular-nums text-muted-foreground">luego {secondEta}</span> : null}
            </div>
        </button>
    );
}
