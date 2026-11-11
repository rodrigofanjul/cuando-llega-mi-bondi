import { create } from "zustand";
import { persist } from "zustand/middleware";

import { MAX_CONFIGS, parseWidgetConfigs, type WidgetConfig } from "@features/widgets/lib/config";
import { createWidgetBridge, type WidgetBridge } from "@features/widgets/native/bridge";

interface WidgetConfigsState {
    configs: WidgetConfig[];
    /** Último error al sincronizar con los widgets nativos (null = OK o web). */
    syncError: string | null;
    upsert: (config: WidgetConfig) => void;
    remove: (id: string) => void;
}

let bridge: WidgetBridge | null = null;
export function getWidgetBridge(): WidgetBridge {
    return getBridge();
}

function getBridge(): WidgetBridge {
    bridge ??= createWidgetBridge();
    return bridge;
}

/** Sólo para tests. */
export function __setWidgetBridgeForTests(b: WidgetBridge | null) {
    bridge = b;
}

export const useWidgetConfigsStore = create<WidgetConfigsState>()(
    persist(
        (set, get) => {
            const sync = (configs: WidgetConfig[]) => {
                getBridge()
                    .saveConfigs(configs)
                    .then(() => set({ syncError: null }))
                    .catch((err: unknown) =>
                        set({ syncError: err instanceof Error ? err.message : "No se pudieron actualizar los widgets." }),
                    );
            };
            return {
                configs: [],
                syncError: null,
                upsert: (config) => {
                    const current = get().configs;
                    const exists = current.some((c) => c.id === config.id);
                    if (!exists && current.length >= MAX_CONFIGS) {
                        set({ syncError: `Máximo ${MAX_CONFIGS} widgets.` });
                        return;
                    }
                    const configs = exists ? current.map((c) => (c.id === config.id ? config : c)) : [...current, config];
                    set({ configs });
                    sync(configs);
                },
                remove: (id) => {
                    const configs = get().configs.filter((c) => c.id !== id);
                    set({ configs });
                    sync(configs);
                },
            };
        },
        {
            name: "bondi:widget-configs",
            version: 1,
            partialize: (s) => ({ configs: s.configs }),
            // Configuraciones corruptas o de otra versión no rompen la app.
            merge: (persisted, current) => {
                const raw = (persisted as { configs?: unknown } | undefined)?.configs ?? [];
                const parsed = parseWidgetConfigs(raw);
                return { ...current, configs: parsed.ok ? parsed.configs : [] };
            },
        },
    ),
);
