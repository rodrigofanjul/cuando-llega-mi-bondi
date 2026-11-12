"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { Favorito } from "@features/favorites/types";
import { useFavoritesStore } from "@features/favorites/store/useFavoritesStore";
import { groupByCorner } from "@features/home/lib/corners";
import { pickNowCard } from "@features/home/lib/nowCard";
import { loadRecents, pushRecent, saveRecents } from "@features/home/lib/recentSearches";
import { useNow } from "@features/home/hooks/useNow";
import { sanitizeMissQuery, sendUx } from "@features/home/lib/uxMetrics";
import { suggest } from "@features/personalization/lib/habits";
import { useHabitsStore } from "@features/personalization/store/useHabitsStore";
import { looksLikeQuestion, quickSearch, type SearchItem } from "@features/search/lib/quickSearch";
import { useSearchIndex } from "@features/search/hooks/useSearchIndex";
import { useSearchFlowStore } from "@features/search/store/useSearchFlowStore";

import { CornerCard } from "./CornerCard";
import { NowCard } from "./NowCard";
import { SearchBar } from "./SearchBar";
import { SearchResults } from "./SearchResults";

export function HomeScreen() {
    const router = useRouter();
    const favoritos = useFavoritesStore((s) => s.favoritos);
    const habitsEnabled = useHabitsStore((s) => s.enabled);
    const habitEvents = useHabitsStore((s) => s.events);
    const index = useSearchIndex();
    const now = useNow();
    const [query, setQuery] = useState("");
    const deferredQuery = useDeferredValue(query);
    const inputWrapRef = useRef<HTMLDivElement>(null);
    const [focused, setFocused] = useState(false);
    const [recents, setRecents] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadRecents()));

    const groups = useMemo(() => groupByCorner(favoritos), [favoritos]);
    const stopCoords = useMemo(() => new Map((index?.stops ?? []).map((s) => [s.id, { lat: s.lat, lng: s.lng }])), [index]);
    const habitFavId = useMemo(() => {
        if (!habitsEnabled) return null;
        return suggest(habitEvents, now, new Set(favoritos.map((f) => f.id)))?.favId ?? null;
    }, [habitsEnabled, habitEvents, now, favoritos]);
    const nowPick = pickNowCard({ favoritos, habitFavId, position: null, stopCoords });
    const nowFav = nowPick ? (favoritos.find((f) => f.id === nowPick.favId) ?? null) : null;

    const favStopIds = useMemo(() => new Set(favoritos.map((f) => f.identificadorParada)), [favoritos]);
    const result = useMemo(
        () => (index && deferredQuery.trim() ? quickSearch(index, deferredQuery, { favoriteStopIds: favStopIds }) : null),
        [index, deferredQuery, favStopIds],
    );
    const noResults = result !== null && result.items.length === 0;
    // Búsqueda sin resultado tras 1 s sin tipear (sólo texto normalizado, sin números de puerta).
    useEffect(() => {
        if (!noResults || deferredQuery.trim().length < 3) return;
        const t = setTimeout(() => {
            const q = sanitizeMissQuery(deferredQuery);
            if (q) sendUx({ type: "search_miss", q });
        }, 1000);
        return () => clearTimeout(t);
    }, [noResults, deferredQuery]);
    const question = query.trim() && (looksLikeQuestion(query) || noResults) ? query.trim() : null;

    // Las primeras 6 filas (la tarjeta Ahora cuenta como una) consultan cada 25 s; el resto una sola vez.
    const liveIds = useMemo(() => {
        const ids: string[] = [];
        if (nowFav) ids.push(nowFav.id);
        for (const g of groups) for (const f of g.favorites) if (!ids.includes(f.id)) ids.push(f.id);
        return new Set(ids.slice(0, 6));
    }, [nowFav, groups]);

    const openStop = (paradaId: string, codLinea: string) => {
        useSearchFlowStore.getState().resetToParada(paradaId, codLinea, { consulting: true });
    };
    const openFav = (f: Favorito) => openStop(f.identificadorParada, f.codigoLineaParada);
    const remember = (q: string) => {
        const next = pushRecent(recents, q);
        setRecents(next);
        saveRecents(next);
    };
    const onPick = (it: SearchItem) => {
        remember(query);
        if (it.stopId && it.lineCode) {
            openStop(it.stopId, it.lineCode);
            setQuery("");
            inputWrapRef.current?.querySelector("input")?.blur();
        }
        else if (it.expandQuery) setQuery(it.expandQuery);
    };
    const onAsk = (q: string) => {
        remember(q);
        router.push(`/asistente?q=${encodeURIComponent(q)}`);
    };

    const searching = query.trim().length > 0;
    return (
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-[calc(140px+env(safe-area-inset-bottom))] pt-4 lg:pb-8">
            <div className="order-last lg:order-first">
                <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-30 px-4 pb-2 lg:static lg:px-0 lg:pb-0">
                    <div ref={inputWrapRef} className="mx-auto max-w-[640px]">
                        <SearchBar value={query} onChange={setQuery} onFocusChange={setFocused} onNear={() => router.push("/paradas-cerca")} />
                    </div>
                </div>
            </div>

            {searching ? (
                <SearchResults
                    items={result?.items ?? []}
                    question={question}
                    loading={index === null}
                    onPick={onPick}
                    onAsk={onAsk}
                    onByStreets={() => router.push("/consultar")}
                />
            ) : (
                <>
                    {focused && recents.length > 0 ? (
                        <div className="flex flex-wrap gap-2" aria-label="Búsquedas recientes">
                            {recents.map((r) => (
                                <button key={r} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery(r)} className="min-h-[40px] rounded-full border border-border px-3 text-[14px]">
                                    {r}
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {nowFav && nowPick ? <NowCard fav={nowFav} reason={nowPick.reason} now={now} onOpen={openFav} /> : null}
                    {groups.length > 0 ? (
                        <section className="flex flex-col gap-3">
                            <h2 className="text-[12px] font-semibold uppercase tracking-[1.2px] text-muted-foreground">Tus paradas</h2>
                            {groups.map((g) => (
                                <CornerCard key={g.key} group={g} now={now} liveIds={liveIds} onOpen={openFav} />
                            ))}
                        </section>
                    ) : (
                        <div className="rounded-[16px] border border-dashed border-border p-5 text-[15px] text-muted-foreground">
                            Buscá tu parada y tocá <strong>♥</strong> para tenerla acá siempre, con los minutos al abrir.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
