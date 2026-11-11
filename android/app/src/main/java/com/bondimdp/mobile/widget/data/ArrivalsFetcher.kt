package com.bondimdp.mobile.widget.data

import com.bondimdp.mobile.widget.core.ArrivalParser
import com.bondimdp.mobile.widget.core.QuerySnapshot
import com.bondimdp.mobile.widget.core.SnapshotArrival
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Consulta arribos con **el mismo endpoint HTTP que ya usa la web**
 * (`{apiBase}/mgp/RecuperarProximosArribosW`, ver shared/api/client.ts). No
 * agrega fuentes nuevas. Reglas de consumo:
 * - una request por (parada, línea) compartida por todos los widgets;
 * - no reconsulta si el snapshot tiene menos de [MIN_REFETCH_MS];
 * - como máximo [MAX_QUERIES_PER_RUN] por ejecución.
 */
class ArrivalsFetcher(private val apiBase: String) {

    fun fetch(stopId: String, lineCode: String, now: Long): QuerySnapshot {
        val url = "$apiBase/mgp/RecuperarProximosArribosW" +
            "?identificadorParada=${enc(stopId)}&codigoLineaParada=${enc(lineCode)}"
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
            }
            try {
                val code = conn.responseCode
                if (code !in 200..299) return failure(stopId, lineCode, now, "Servicio no disponible ($code)")
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                parseResponse(body, stopId, lineCode, now)
            } finally {
                conn.disconnect()
            }
        } catch (e: java.io.IOException) {
            failure(stopId, lineCode, now, "Sin conexión")
        }
    }

    companion object {
        const val MIN_REFETCH_MS = 90_000L
        const val MAX_QUERIES_PER_RUN = 12
        private const val TIMEOUT_MS = 12_000

        private fun enc(v: String) = URLEncoder.encode(v, "UTF-8")

        private fun failure(stopId: String, lineCode: String, now: Long, msg: String) =
            QuerySnapshot(stopId, lineCode, now, msg, emptyList())

        /** Misma validación que el cliente web: `CodigoEstado != 0` es error de negocio. */
        fun parseResponse(body: String, stopId: String, lineCode: String, now: Long): QuerySnapshot {
            val o = runCatching { JSONObject(body) }.getOrNull()
                ?: return failure(stopId, lineCode, now, "Respuesta inválida")
            val estado = if (o.has("CodigoEstado")) o.optInt("CodigoEstado") else o.optInt("codigoEstado", 0)
            if (estado != 0) {
                val msg = o.optString("MensajeEstado", o.optString("mensajeEstado", "")).ifBlank { "Sin datos" }
                return failure(stopId, lineCode, now, msg)
            }
            val arr = o.optJSONArray("arribos") ?: o.optJSONArray("Arribos")
                ?: return QuerySnapshot(stopId, lineCode, now, null, emptyList())
            val arrivals = (0 until arr.length()).mapNotNull { i ->
                val a = arr.optJSONObject(i) ?: return@mapNotNull null
                val eta = ArrivalParser.parseEta(a.optString("Arribo"))
                val destination = listOf(
                    "DescripcionCartelBandera", "descripcionCartelBandera",
                    "DescripcionBandera", "descripcionBandera",
                    "DescripcionCortaBandera", "descripcionCortaBandera",
                ).firstNotNullOfOrNull { k -> a.optString(k, "").trim().ifEmpty { null } } ?: ""
                val vehicle = a.optString("IdentificadorCoche", "").trim().takeIf { it.isNotEmpty() && it != "0" }
                SnapshotArrival(lineCode, destination, eta.minutes, eta.status, vehicle)
            }
            return QuerySnapshot(stopId, lineCode, now, null, arrivals)
        }
    }
}
