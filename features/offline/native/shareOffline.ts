/**
 * Lleva la estimación histórica a los widgets nativos: sólo los pares (parada,
 * línea) que algún widget muestra. Sin perfil se envía una tabla vacía para que
 * el widget no siga usando uno descartado.
 */
import type { ProfileArtifact } from "@features/offline/lib/profiles";
import { arDayIndex, buildOfflineWidgetTable } from "@features/offline/lib/widgetTable";
import { requiredQueries, type WidgetConfig } from "@features/widgets/lib/config";
import type { WidgetBridge } from "@features/widgets/native/bridge";

const EMPTY: ProfileArtifact = {
    schema_version: 1,
    profile_version: "none",
    generated_at: "",
    data_source: "none",
    calendar_version: "",
    bin_minutes: 15,
    entries: {},
    sha256: "0".repeat(64),
};

let lastSent: string | null = null;

/** Sólo para tests. */
export function __resetOfflineShareForTests() {
    lastSent = null;
}

export async function shareOfflineWithWidgets(
    bridge: Pick<WidgetBridge, "available" | "saveOfflineTable">,
    profile: ProfileArtifact | null,
    configs: WidgetConfig[],
    syncedAt: number | null,
    now: number,
): Promise<boolean> {
    if (!bridge.available) return false;
    const pairs = requiredQueries(configs);
    // Se reenvía al cambiar el perfil, los pares o el día (el horizonte avanza).
    const key = `${profile?.sha256 ?? "none"}|${pairs.map((p) => `${p.stopId}|${p.lineCode}`).join(",")}|${arDayIndex(now)}`;
    if (key === lastSent) return false;
    const ok = await bridge.saveOfflineTable(buildOfflineWidgetTable(profile ?? EMPTY, pairs, syncedAt ?? 0, now));
    if (ok) lastSent = key;
    return ok;
}
