import { create } from "zustand";
import { persist } from "zustand/middleware";

import { acceptProfile, profileArtifactSchema, type FrequencyBaseline, type ProfileArtifact, type ProfileStoreState } from "@features/offline/lib/profiles";

interface OfflineStore extends ProfileStoreState {
    frequencies: FrequencyBaseline | null;
    frequenciesSource: string | null;
    syncedAt: number | null;
    ingest: (incoming: unknown, at: number) => Promise<void>;
    setFrequencies: (lines: FrequencyBaseline, source: string) => void;
}

/** Perfiles offline + frecuencias publicadas, en el dispositivo (versión actual y anterior). */
export const useOfflineStore = create<OfflineStore>()(
    persist(
        (set, get) => ({
            current: null,
            previous: null,
            lastError: null,
            frequencies: null,
            frequenciesSource: null,
            syncedAt: null,
            ingest: async (incoming, at) => {
                const next = await acceptProfile({ current: get().current, previous: get().previous, lastError: null }, incoming);
                set({ ...next, syncedAt: next.lastError ? get().syncedAt : at });
            },
            setFrequencies: (lines, source) => set({ frequencies: lines, frequenciesSource: source }),
        }),
        {
            name: "bondi:offline",
            version: 1,
            partialize: (s) => ({ current: s.current, previous: s.previous, frequencies: s.frequencies, frequenciesSource: s.frequenciesSource, syncedAt: s.syncedAt }),
            // Un perfil persistido inválido se descarta (no rompe la app).
            merge: (persisted, current) => {
                const p = (persisted ?? {}) as Partial<OfflineStore>;
                const valid = (x: unknown): ProfileArtifact | null => {
                    const r = profileArtifactSchema.safeParse(x);
                    return r.success ? r.data : null;
                };
                return {
                    ...current,
                    current: valid(p.current),
                    previous: valid(p.previous),
                    frequencies: p.frequencies ?? null,
                    frequenciesSource: p.frequenciesSource ?? null,
                    syncedAt: typeof p.syncedAt === "number" ? p.syncedAt : null,
                };
            },
        },
    ),
);
