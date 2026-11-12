import type { SupabaseClient } from "@supabase/supabase-js";

import { inferBatch, planWindow, type ObservationDbRow } from "@features/observations/lib/inferJob";

const PAGE = 1000;
/** Tope de lectura por corrida (protege memoria y costo si el volumen crece). */
const MAX_ROWS = 200_000;
const INSERT_CHUNK = 500;

export interface InferJobReport {
    read: number;
    series: number;
    inferred: number;
    untracked: number;
    truncated: boolean;
}

/** Lee observaciones recientes, infiere llegadas y las guarda (idempotente por UNIQUE). */
export async function runInferArrivalsJob(db: SupabaseClient, now: number): Promise<InferJobReport> {
    const w = planWindow(now);
    const rows: ObservationDbRow[] = [];
    let truncated = false;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
            .from("arrival_observations")
            .select("observed_at,stop_id,line_code,vehicle_id,eta_minutes,eta_status")
            .gte("observed_at", new Date(w.readFrom).toISOString())
            .order("observed_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw new Error("read_failed");
        rows.push(...((data ?? []) as ObservationDbRow[]));
        if (!data || data.length < PAGE) break;
        if (rows.length >= MAX_ROWS) {
            truncated = true;
            break;
        }
    }

    const batch = inferBatch(rows, w);
    for (let i = 0; i < batch.rows.length; i += INSERT_CHUNK) {
        const { error } = await db
            .from("inferred_arrivals")
            .upsert(batch.rows.slice(i, i + INSERT_CHUNK), { onConflict: "stop_id,line_code,vehicle_id,arrived_at", ignoreDuplicates: true });
        if (error) throw new Error("write_failed");
    }
    return { read: rows.length, series: batch.series, inferred: batch.rows.length, untracked: batch.untracked, truncated };
}
