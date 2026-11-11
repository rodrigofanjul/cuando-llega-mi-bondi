import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";

import { EMPTY_ALERT_STATE, alertRuleSchema, type AlertRule, type AlertState } from "@features/alerts/lib/engine";
import type { CycleResult } from "@features/alerts/lib/runner";

export const MAX_ALERT_RULES = 15;

interface AlertsStore {
    rules: AlertRule[];
    engineState: AlertState;
    lastRunAt: number | null;
    lastUndelivered: number;
    upsert: (rule: AlertRule) => boolean;
    remove: (id: string) => void;
    toggle: (id: string) => void;
    applyCycle: (result: CycleResult, at: number) => void;
}

const persistedSchema = z.object({
    rules: z.array(z.unknown()).default([]),
    engineState: z
        .object({ fired: z.record(z.string(), z.number()), lastEta: z.record(z.string(), z.number()) })
        .default(EMPTY_ALERT_STATE),
});

export const useAlertsStore = create<AlertsStore>()(
    persist(
        (set, get) => ({
            rules: [],
            engineState: EMPTY_ALERT_STATE,
            lastRunAt: null,
            lastUndelivered: 0,
            upsert: (rule) => {
                const rules = get().rules;
                const exists = rules.some((r) => r.id === rule.id);
                if (!exists && rules.length >= MAX_ALERT_RULES) return false;
                set({ rules: exists ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule] });
                return true;
            },
            remove: (id) => set({ rules: get().rules.filter((r) => r.id !== id) }),
            toggle: (id) => set({ rules: get().rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) }),
            applyCycle: (result, at) =>
                set({
                    engineState: result.state,
                    rules: get().rules.filter((r) => !result.expiredRuleIds.includes(r.id)),
                    lastRunAt: at,
                    lastUndelivered: result.undelivered.length,
                }),
        }),
        {
            name: "bondi:alerts",
            version: 1,
            partialize: (s) => ({ rules: s.rules, engineState: s.engineState }),
            // Reglas inválidas se descartan una por una; nunca rompen la app.
            merge: (persisted, current) => {
                const parsed = persistedSchema.safeParse(persisted);
                if (!parsed.success) return current;
                const rules = parsed.data.rules
                    .map((r) => alertRuleSchema.safeParse(r))
                    .filter((r) => r.success)
                    .map((r) => r.data);
                return { ...current, rules, engineState: parsed.data.engineState };
            },
        },
    ),
);
