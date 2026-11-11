"use client";

import { useEffect } from "react";

import { resolveFavoritoLinea } from "@features/favorites/resolveFavoritoLinea";
import { useFavoritesStore } from "@features/favorites/store/useFavoritesStore";
import { useOfflineStore } from "@features/offline/store/useOfflineStore";
import { requiredQueries } from "@features/widgets/lib/config";
import { getWidgetBridge, useWidgetConfigsStore } from "@features/widgets/store/useWidgetConfigsStore";
import { shareOfflineWithWidgets } from "@features/offline/native/shareOffline";

const SYNC_EVERY_MS = 12 * 60 * 60_000;

/**
 * Con conexión, actualiza perfiles offline (sólo pares de favoritos y widgets) y la
 * frecuencia publicada. Como máximo cada 12 h. Si algo falla, se conserva lo anterior.
 */
function shareWithWidgets() {
    const { current, syncedAt } = useOfflineStore.getState();
    void shareOfflineWithWidgets(getWidgetBridge(), current, useWidgetConfigsStore.getState().configs, syncedAt, Date.now()).catch(() => {
        // Sin widgets nativos o shell viejo: la app sigue igual.
    });
}

export function OfflineSync() {
    // Los widgets reciben la tabla offline al cambiar el perfil o sus pares (sólo en el shell nativo).
    useEffect(() => {
        shareWithWidgets();
        const offUnsub = useOfflineStore.subscribe((s, prev) => {
            if (s.current !== prev.current) shareWithWidgets();
        });
        const widgetsUnsub = useWidgetConfigsStore.subscribe((s, prev) => {
            if (s.configs !== prev.configs) shareWithWidgets();
        });
        return () => {
            offUnsub();
            widgetsUnsub();
        };
    }, []);

    useEffect(() => {
        const run = async () => {
            if (!navigator.onLine) return;
            const store = useOfflineStore.getState();
            const now = Date.now();
            if (!store.frequencies) {
                try {
                    const res = await fetch("/offline/frequencies-v1.json");
                    if (res.ok) {
                        const body = (await res.json()) as { lines: Parameters<typeof store.setFrequencies>[0]; source: string };
                        store.setFrequencies(body.lines, body.source);
                    }
                } catch {
                    // Sin frecuencias: el modo offline informa «datos insuficientes».
                }
            }
            if (store.syncedAt && now - store.syncedAt < SYNC_EVERY_MS) return;
            const favs = useFavoritesStore.getState().favoritos;
            const pairs = new Set<string>();
            for (const f of favs) {
                const line = resolveFavoritoLinea(f, new Map());
                if (line && f.identificadorParada) pairs.add(`${f.identificadorParada}|${line}`);
            }
            for (const q of requiredQueries(useWidgetConfigsStore.getState().configs)) pairs.add(`${q.stopId}|${q.lineCode}`);
            if (pairs.size === 0) return;
            try {
                const res = await fetch(`/api/offline/profiles?pairs=${encodeURIComponent([...pairs].slice(0, 20).join(","))}`);
                if (res.ok) await store.ingest(await res.json(), now);
            } catch {
                // Se reintenta en la próxima apertura con conexión.
            }
        };
        void run();
        window.addEventListener("online", run);
        return () => window.removeEventListener("online", run);
    }, []);
    return null;
}
