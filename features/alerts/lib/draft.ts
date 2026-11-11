import type { Favorito } from "@features/favorites/types";
import { favoriteToTarget } from "@features/widgets/lib/draft";
import { arLocalParts } from "@shared/time/argentina";

import { alertRuleSchema, type AlertRule } from "./engine";

export type TriggerKind = AlertRule["trigger"]["type"];

export interface AlertDraft {
    id: string;
    favoriteIds: string[];
    trigger: TriggerKind;
    thresholdMin: number;
    walkMin: number;
    marginMin: number;
    minDelayMin: number;
    recurring: boolean;
    days: number[];
    from: string;
    to: string;
}

export function newAlertDraft(id: string): AlertDraft {
    return {
        id,
        favoriteIds: [],
        trigger: "eta-threshold",
        thresholdMin: 10,
        walkMin: 5,
        marginMin: 2,
        minDelayMin: 5,
        recurring: true,
        days: [1, 2, 3, 4, 5],
        from: "07:00",
        to: "09:00",
    };
}

export type AlertDraftResult = { ok: true; rule: AlertRule } | { ok: false; error: string };

export function alertDraftToRule(draft: AlertDraft, favoritos: Favorito[], map: Map<string, string>, now: number): AlertDraftResult {
    const byId = new Map(favoritos.map((f) => [f.id, f]));
    const targets = draft.favoriteIds.map((id) => {
        const fav = byId.get(id);
        return fav ? favoriteToTarget(fav, map, false) : null;
    });
    if (targets.length === 0) return { ok: false, error: "Elegí al menos una parada favorita." };
    if (targets.some((t) => t === null)) return { ok: false, error: "Algún favorito no tiene línea reconocida." };
    if (targets.length > 5) return { ok: false, error: "Como máximo 5 paradas por alerta." };
    if (draft.recurring && draft.days.length === 0) return { ok: false, error: "Elegí al menos un día." };

    const trigger =
        draft.trigger === "eta-threshold"
            ? { type: "eta-threshold", minutes: draft.thresholdMin }
            : draft.trigger === "leave-home"
              ? { type: "leave-home", walkMin: draft.walkMin, marginMin: draft.marginMin, leadMin: 1 }
              : { type: "delay", minDelayMin: draft.minDelayMin };
    const schedule = draft.recurring
        ? { type: "recurring", days: draft.days, from: draft.from, to: draft.to }
        : { type: "once", date: arLocalParts(now).date, from: draft.from, to: draft.to };

    const parsed = alertRuleSchema.safeParse({ id: draft.id, enabled: true, targets, trigger, schedule });
    if (parsed.success) return { ok: true, rule: parsed.data };
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Revisá «${issue.path.join(".")}»: ${issue.message}` };
}

export function describeRule(r: AlertRule): string {
    const lines = r.targets.map((t) => `${t.lineLabel} en ${t.stopLabel}`).join(", ");
    const what =
        r.trigger.type === "eta-threshold"
            ? `cuando esté a ${r.trigger.minutes} min`
            : r.trigger.type === "leave-home"
              ? `cuándo salir (caminás ${r.trigger.walkMin} min)`
              : `si se demora ${r.trigger.minDelayMin} min o más`;
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const when =
        r.schedule.type === "once"
            ? `hoy ${r.schedule.from}–${r.schedule.to}`
            : `${r.schedule.days.map((d) => days[d]).join(" ")} ${r.schedule.from}–${r.schedule.to}`;
    return `${lines}: ${what} · ${when}`;
}
