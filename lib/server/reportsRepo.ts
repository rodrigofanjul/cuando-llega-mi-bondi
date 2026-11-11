import { createHash } from "node:crypto";

import type { ReportType, StoredReport } from "@features/reports/lib/reports";
import { createAdminClient } from "@/lib/server/supabaseAdmin";
import { supabaseSecretKey, supabaseUrl } from "@/lib/server/supabaseEnv";

/** Acceso a datos de reportes (service role). Sin sal o sin Supabase → no disponible. */
export function reportsConfigured(): boolean {
    return Boolean(process.env.REPORTS_SALT?.trim() && supabaseUrl() && supabaseSecretKey());
}

/** SHA-256(deviceId + sal): no reversible sin la sal, que nunca sale del servidor. */
export function reporterHash(deviceId: string): string {
    return createHash("sha256").update(`${deviceId}:${process.env.REPORTS_SALT ?? ""}`).digest("hex");
}

interface Row {
    id: string;
    type: ReportType;
    line_code: string;
    stop_id: string | null;
    occupancy: StoredReport["occupancy"];
    text: string | null;
    reporter_hash: string;
    status: StoredReport["status"];
    created_at: string;
    expires_at: string;
}

function toStored(r: Row): StoredReport {
    return {
        id: r.id,
        type: r.type,
        lineCode: r.line_code,
        stopId: r.stop_id,
        occupancy: r.occupancy,
        text: r.text,
        reporterHash: r.reporter_hash,
        status: r.status,
        createdAt: Date.parse(r.created_at),
        expiresAt: Date.parse(r.expires_at),
    };
}

export async function insertReport(r: Omit<StoredReport, "id">, moderationReason: string | null): Promise<void> {
    const { error } = await createAdminClient()
        .from("community_reports")
        .insert({
            type: r.type,
            line_code: r.lineCode,
            stop_id: r.stopId,
            occupancy: r.occupancy,
            text: r.text,
            reporter_hash: r.reporterHash,
            status: r.status,
            moderation_reason: moderationReason,
            created_at: new Date(r.createdAt).toISOString(),
            expires_at: new Date(r.expiresAt).toISOString(),
        });
    if (error) throw new Error("insert_failed");
}

export async function activeReports(lineCode: string, now: number): Promise<StoredReport[]> {
    const { data, error } = await createAdminClient()
        .from("community_reports")
        .select("id,type,line_code,stop_id,occupancy,text,reporter_hash,status,created_at,expires_at")
        .eq("line_code", lineCode)
        .eq("status", "approved")
        .gt("expires_at", new Date(now).toISOString())
        .order("created_at", { ascending: false })
        .limit(300);
    if (error) throw new Error("select_failed");
    return (data as Row[]).map(toStored);
}

export async function reputationWeights(hashes: string[]): Promise<Map<string, { corroborated: number; total: number }>> {
    if (hashes.length === 0) return new Map();
    const { data, error } = await createAdminClient()
        .from("reporter_reputation")
        .select("reporter_hash,corroborated,total")
        .in("reporter_hash", hashes);
    if (error) throw new Error("reputation_failed");
    return new Map((data as { reporter_hash: string; corroborated: number; total: number }[]).map((r) => [r.reporter_hash, { corroborated: r.corroborated, total: r.total }]));
}
