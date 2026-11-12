import type { Favorito } from "@features/favorites/types";
import { haversineMeters } from "@shared/geo/haversine";

export const NEAR_METERS = 400;

export interface NowCardInput {
    favoritos: Favorito[];
    habitFavId: string | null;
    position: { lat: number; lng: number } | null;
    stopCoords: Map<string, { lat: number; lng: number }>;
}

/** Tarjeta «Ahora» (spec §4): hábito aprendido → favorito a < 400 m → nada. Nunca inventa. */
export function pickNowCard(input: NowCardInput): { favId: string; reason: "habit" | "near" } | null {
    if (input.habitFavId && input.favoritos.some((f) => f.id === input.habitFavId)) return { favId: input.habitFavId, reason: "habit" };
    if (!input.position) return null;
    let best: { favId: string; d: number } | null = null;
    for (const f of input.favoritos) {
        const c = input.stopCoords.get(f.identificadorParada);
        if (!c) continue;
        const d = haversineMeters(input.position.lat, input.position.lng, c.lat, c.lng);
        if (d < NEAR_METERS && (!best || d < best.d)) best = { favId: f.id, d };
    }
    return best ? { favId: best.favId, reason: "near" } : null;
}
