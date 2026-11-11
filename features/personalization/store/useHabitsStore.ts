import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";

import { recordEvent, type HabitEvent } from "@features/personalization/lib/habits";

interface HabitsState {
    /** Apagado por defecto: sólo se registra con consentimiento explícito. */
    enabled: boolean;
    events: HabitEvent[];
    setEnabled: (enabled: boolean) => void;
    record: (favId: string, now: number) => void;
    clear: () => void;
}

const persistedSchema = z.object({
    enabled: z.boolean().default(false),
    events: z.array(z.object({ favId: z.string().max(120), at: z.number().int() })).default([]),
});

export const useHabitsStore = create<HabitsState>()(
    persist(
        (set, get) => ({
            enabled: false,
            events: [],
            // Desactivar también borra: no queda historial guardado sin uso.
            setEnabled: (enabled) => set(enabled ? { enabled } : { enabled, events: [] }),
            record: (favId, now) => {
                if (!get().enabled) return;
                set({ events: recordEvent(get().events, favId, now) });
            },
            clear: () => set({ events: [] }),
        }),
        {
            name: "bondi:habits",
            version: 1,
            partialize: (s) => ({ enabled: s.enabled, events: s.events }),
            merge: (persisted, current) => {
                const parsed = persistedSchema.safeParse(persisted);
                return parsed.success ? { ...current, ...parsed.data } : current;
            },
        },
    ),
);
