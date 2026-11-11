"use client";

import { useState, useSyncExternalStore } from "react";

import { getWidgetBridge } from "@features/widgets/store/useWidgetConfigsStore";
import { clearAppData, listAppKeys } from "@shared/privacy/localData";

const noopSubscribe = () => () => {};

function countKeys(): number {
    try {
        return listAppKeys(localStorage).length;
    } catch {
        return 0;
    }
}

/** «Borrar datos de este dispositivo»: LocalStorage propio + configuración de widgets nativos. */
export function LocalDataSection() {
    const stored = useSyncExternalStore(noopSubscribe, countKeys, () => 0);
    const [status, setStatus] = useState<string | null>(null);

    const erase = async () => {
        if (!window.confirm("¿Borrar favoritos, historial, widgets, alertas y sugerencias de este dispositivo? No se puede deshacer.")) return;
        let removed = 0;
        try {
            removed = clearAppData(localStorage);
        } catch {
            setStatus("No se pudo acceder al almacenamiento del navegador.");
            return;
        }
        try {
            await getWidgetBridge().saveConfigs([]); // widgets nativos sin configuración
        } catch {
            // En la web no hay widgets; en nativo, un fallo no impide el borrado local.
        }
        setStatus(`Se borraron ${removed} datos guardados. Recargando…`);
        window.setTimeout(() => window.location.reload(), 800);
    };

    return (
        <section aria-labelledby="local-data-title" className="mt-8 rounded-2xl border border-border p-4">
            <h2 id="local-data-title" className="text-[14px] font-semibold text-foreground">
                Datos en este dispositivo
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Favoritos, historial, widgets, alertas, sugerencias y preferencias se guardan sólo en este dispositivo
                {stored > 0 ? ` (${stored} elementos)` : ""}. Podés borrarlos cuando quieras.
            </p>
            <button
                type="button"
                onClick={() => void erase()}
                className="mt-3 min-h-10 rounded-lg border border-destructive/40 px-3 text-[13px] font-semibold text-destructive"
            >
                Borrar datos de este dispositivo
            </button>
            {status ? (
                <p role="status" className="mt-2 text-[12px] text-muted-foreground">
                    {status}
                </p>
            ) : null}
        </section>
    );
}
