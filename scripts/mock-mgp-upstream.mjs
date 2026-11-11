#!/usr/bin/env node
/**
 * MOCK de upstream MGP para desarrollo y pruebas en emulador. NO son datos reales.
 *
 * Responde sólo `GET /mgp/RecuperarProximosArribosW` con arribos SINTÉTICOS que
 * descuentan minutos en tiempo real (para ver widgets/alertas moverse), con
 * destino «MOCK ...» para que nunca se confundan con datos reales. El resto → 404.
 *
 * Uso (evita todo tráfico a la Municipalidad):
 *   node scripts/mock-mgp-upstream.mjs            # puerto 3200
 *   MGP_DIRECT_DISABLED=true MGP_UPSTREAM=http://127.0.0.1:3200 next dev
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3200);
const START = Date.now();
const CYCLE_MIN = 12; // cada unidad "pasa" cada 12 minutos

/** Tres unidades desfasadas; el ETA baja 1 por minuto y reinicia al llegar. */
function arribos(stopId, lineCode) {
    const elapsedMin = Math.floor((Date.now() - START) / 60_000);
    return [2, 6, 11].map((offset, i) => {
        const eta = (offset - elapsedMin + CYCLE_MIN * 10) % CYCLE_MIN;
        return {
            Arribo: eta === 0 ? "Arribando.." : `${eta} min. aprox.`,
            CodigoLineaParada: lineCode,
            DescripcionLinea: lineCode,
            DescripcionCartelBandera: i % 2 === 0 ? "MOCK A CENTRO" : "MOCK A PUERTO",
            DesvioHorario: i === 1 ? "+06:00" : "00:00",
            EsAdaptado: i === 0 ? "True" : "False",
            IdentificadorChofer: "0",
            IdentificadorCoche: `MOCK-${i + 1}`,
            Latitud: "0",
            Longitud: "0",
            LatitudParada: "0",
            LongitudParada: "0",
            UltimaFechaHoraGPS: new Date().toISOString(),
            MensajeError: "",
            _mockStop: stopId,
        };
    });
}

createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const send = (status, body) => {
        res.writeHead(status, { "content-type": "application/json", "x-mock": "true" });
        res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === "/mgp/RecuperarProximosArribosW") {
        const stop = url.searchParams.get("identificadorParada") ?? "";
        const line = url.searchParams.get("codigoLineaParada") ?? "";
        console.log(`[mock] arribos stop=${stop} line=${line}`);
        return send(200, { CodigoEstado: 0, MensajeEstado: "MOCK", arribos: arribos(stop, line) });
    }
    console.log(`[mock] 404 ${req.method} ${url.pathname}`);
    return send(404, { error: "mock_not_implemented" });
}).listen(PORT, () => console.log(`[mock] MGP upstream MOCK escuchando en :${PORT}`));
