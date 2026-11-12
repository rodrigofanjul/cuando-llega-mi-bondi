"use client";

import type { ReactNode } from "react";

import { quickAlertRule } from "@features/alerts/lib/quickAlert";
import { getNotificationPermission, requestNotificationPermission } from "@features/alerts/native/notifier";
import { useAlertsStore } from "@features/alerts/store/useAlertsStore";
import { readStoredWalkMin } from "@features/departure/components/DepartureAdvisor";
import { sendUx } from "@features/home/lib/uxMetrics";
import { arLocalParts } from "@shared/time/argentina";
import { toast } from "@shared/ui/store/useToastStore";

interface Props {
    readonly isFavorite: boolean;
    readonly onToggleFavorite: () => void;
    readonly share: ReactNode;
    readonly target: {
        stopId: string;
        stopLabel: string;
        lineCode: string;
        lineLabel: string;
        destination: string;
    } | null;
}

/** Barra fija al pie del detalle de parada: Guardar · Avisarme · Compartir. */
export function StopActionBar({ isFavorite, onToggleFavorite, share, target }: Props) {
    const upsert = useAlertsStore((s) => s.upsert);

    const onAlert = async () => {
        if (!target) return;
        const now = Date.now();
        const today = arLocalParts(now).date;
        const duplicated = useAlertsStore
            .getState()
            .rules.some(
                (r) =>
                    r.enabled &&
                    (r.schedule.type !== "once" || r.schedule.date === today) &&
                    r.targets.some((t) => t.stopId === target.stopId && t.lineCode === target.lineCode),
            );
        if (duplicated) {
            toast({ description: "Ya tenés un aviso para esta parada." });
            return;
        }

        const rule = quickAlertRule({
            id: `q-${target.stopId}-${target.lineCode}-${now}`,
            target,
            walkMin: readStoredWalkMin(target.stopId),
            now,
        });
        if (!upsert(rule)) {
            toast({ description: "Llegaste al máximo de alertas." });
            return;
        }
        sendUx({ type: "quick_alert" });
        const minutes = rule.trigger.type === "eta-threshold" ? rule.trigger.minutes : null;
        const text =
            minutes === null
                ? "Aviso creado (próximas 2 h)."
                : `Te aviso cuando ${minutes === 1 ? "falte 1 min" : `falten ${minutes} min`} (próximas 2 h).`;
        toast({ description: text });

        // El permiso se pide después de crear la regla: el aviso queda guardado aunque se bloquee.
        let permission = await getNotificationPermission();
        if (permission === "prompt") permission = await requestNotificationPermission();
        if (permission === "denied" || permission === "unsupported") {
            toast({
                description:
                    "Las notificaciones están bloqueadas en este dispositivo: habilitalas para recibir el aviso.",
            });
        }
    };

    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-3 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
            <button
                type="button"
                onClick={onToggleFavorite}
                aria-pressed={isFavorite}
                className="min-h-[48px] flex-1 rounded-[12px] border border-border text-[15px] font-semibold"
            >
                {isFavorite ? "♥ Guardada" : "♡ Guardar"}
            </button>
            <button
                type="button"
                onClick={() => void onAlert()}
                disabled={!target}
                className="min-h-[48px] flex-1 rounded-[12px] border border-border text-[15px] font-semibold disabled:opacity-50"
            >
                🔔 Avisarme
            </button>
            <div className="flex min-h-[48px] flex-1 items-center justify-center rounded-[12px] border border-border">
                {share}
            </div>
        </div>
    );
}
