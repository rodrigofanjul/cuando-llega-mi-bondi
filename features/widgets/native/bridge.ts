/**
 * Puente hacia el plugin nativo `BondiWidget` (Android: BondiWidgetPlugin.kt,
 * iOS: BondiWidgetPlugin.swift). En la web es un no-op: los widgets sólo
 * existen dentro del shell Capacitor.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

import type { WidgetConfig } from "@features/widgets/lib/config";
import type { QuerySnapshot } from "@features/widgets/lib/rows";
import type { OfflineWidgetTable } from "@features/offline/lib/widgetTable";

import { buildSnapshotPayload, buildStorePayload } from "./payload";

export interface BondiWidgetPlugin {
    saveStore(options: { json: string }): Promise<void>;
    pushSnapshots(options: { json: string }): Promise<void>;
    reloadWidgets(): Promise<void>;
    /** Tabla offline v1 (features/offline/lib/widgetTable.ts). */
    saveOffline(options: { json: string }): Promise<void>;
}

export interface WidgetBridgeDeps {
    isNative: () => boolean;
    plugin: BondiWidgetPlugin;
    now: () => number;
    apiBase: () => string;
}

// Capacitor no permite registrar dos veces el mismo plugin: una sola instancia por módulo.
let registered: BondiWidgetPlugin | null = null;
function plugin(): BondiWidgetPlugin {
    registered ??= registerPlugin<BondiWidgetPlugin>("BondiWidget");
    return registered;
}

function defaultDeps(): WidgetBridgeDeps {
    return {
        isNative: () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BondiWidget"),
        plugin: plugin(),
        now: () => Date.now(),
        apiBase: () => `${window.location.origin}/api`,
    };
}

export function createWidgetBridge(deps: WidgetBridgeDeps = defaultDeps()) {
    return {
        get available(): boolean {
            return deps.isNative();
        },

        /** Guarda configuraciones y pide a los widgets que se redibujen. */
        async saveConfigs(configs: WidgetConfig[]): Promise<boolean> {
            if (!deps.isNative()) return false;
            const json = JSON.stringify(buildStorePayload(configs, deps.apiBase(), deps.now()));
            await deps.plugin.saveStore({ json });
            await deps.plugin.reloadWidgets();
            return true;
        },

        /**
         * Comparte arribos que la app ya consultó: el widget se actualiza sin
         * hacer otra request (menos tráfico al proveedor de datos).
         */
        async pushSnapshots(snapshots: QuerySnapshot[]): Promise<boolean> {
            if (!deps.isNative() || snapshots.length === 0) return false;
            await deps.plugin.pushSnapshots({ json: JSON.stringify(buildSnapshotPayload(snapshots)) });
            return true;
        },

        /**
         * Guarda la tabla de estimación histórica para que el widget la use cuando
         * no hay dato en vivo. Un shell nativo viejo sin el método no rompe la app.
         */
        async saveOfflineTable(table: OfflineWidgetTable): Promise<boolean> {
            if (!deps.isNative()) return false;
            try {
                await deps.plugin.saveOffline({ json: JSON.stringify(table) });
                await deps.plugin.reloadWidgets();
                return true;
            } catch {
                return false;
            }
        },
    };
}

export type WidgetBridge = ReturnType<typeof createWidgetBridge>;
