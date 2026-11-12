"use client";

import useSWR from "swr";

import type { SearchIndex } from "@features/search/lib/searchIndex";

/** Índice de búsqueda: se descarga tras el primer render y SWR lo reutiliza. */
export function useSearchIndex(): SearchIndex | null {
    const { data } = useSWR<SearchIndex>(
        "/api/search-index",
        async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`search-index ${res.status}`);
            return (await res.json()) as SearchIndex;
        },
        { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 3_600_000 },
    );
    return data ?? null;
}
