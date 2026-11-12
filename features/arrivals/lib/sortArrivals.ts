import type { Arribo } from "@features/arrivals/types";
import { parseEtaMinutes } from "@features/arrivals/lib/normalize";

/**
 * Ordena arribos por cercanía: «arribando» primero, luego minutos ascendentes
 * y los ETA no interpretables al final. Estable para empates. No muta la entrada.
 * Solo para presentación: el orden del proveedor no es confiable.
 */
export function sortArribosByEta<T extends Pick<Arribo, "Arribo">>(arribos: readonly T[]): T[] {
    return arribos
        .map((a, i) => ({ a, i, minutes: parseEtaMinutes(a.Arribo).minutes }))
        .sort((x, y) => {
            const kx = x.minutes ?? Number.POSITIVE_INFINITY;
            const ky = y.minutes ?? Number.POSITIVE_INFINITY;
            if (kx !== ky) return kx < ky ? -1 : 1;
            return x.i - y.i;
        })
        .map((e) => e.a);
}
