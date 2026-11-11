package com.bondimdp.mobile.widget.core

import org.json.JSONArray
import org.json.JSONObject

/**
 * Lectura del contrato v1 que escribe la web (features/widgets/native/payload.ts).
 * La validación estricta la hace zod en la web; acá se lee defensivamente y
 * una entrada inválida se descarta en vez de romper el widget.
 */
data class WidgetTarget(
    val stopId: String,
    val stopLabel: String,
    val lineCode: String,
    val lineLabel: String,
    val destination: String,
)

data class SmartSlot(
    val label: String,
    val days: Set<Int>,
    val from: Int,
    val to: Int,
    val targets: List<WidgetTarget>,
)

data class WidgetConfig(
    val id: String,
    val name: String,
    val kind: String,
    val targets: List<WidgetTarget>,
    val slots: List<SmartSlot>,
    val fallbackTargets: List<WidgetTarget>,
    val maxRows: Int,
    val showSecondArrival: Boolean,
)

data class WidgetStore(val apiBase: String, val configs: List<WidgetConfig>, val savedAt: Long)

data class SnapshotArrival(
    val lineCode: String,
    val destination: String,
    val etaMinutes: Int?,
    val status: EtaStatus,
    val vehicleId: String?,
)

data class QuerySnapshot(
    val stopId: String,
    val lineCode: String,
    val fetchedAt: Long,
    val error: String?,
    val arrivals: List<SnapshotArrival>,
) {
    val key: String get() = key(stopId, lineCode)

    companion object {
        fun key(stopId: String, lineCode: String) = "$stopId|$lineCode"
    }
}

object WidgetJson {
    const val VERSION = 1

    fun parseHhMm(value: String?): Int? {
        val m = Regex("^([01]\\d|2[0-3]):([0-5]\\d)$").matchEntire(value ?: return null) ?: return null
        return m.groupValues[1].toInt() * 60 + m.groupValues[2].toInt()
    }

    private fun JSONObject.str(name: String): String = optString(name, "").trim()

    private fun targets(arr: JSONArray?): List<WidgetTarget> {
        if (arr == null) return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            val o = arr.optJSONObject(i) ?: return@mapNotNull null
            val t = WidgetTarget(o.str("stopId"), o.str("stopLabel"), o.str("lineCode"), o.str("lineLabel"), o.str("destination"))
            t.takeIf { it.stopId.isNotEmpty() && it.lineCode.isNotEmpty() }
        }
    }

    private fun config(o: JSONObject): WidgetConfig? {
        if (o.optInt("version") != VERSION) return null
        val display = o.optJSONObject("display") ?: JSONObject()
        val slots = o.optJSONArray("slots")?.let { arr ->
            (0 until arr.length()).mapNotNull { i ->
                val s = arr.optJSONObject(i) ?: return@mapNotNull null
                val from = parseHhMm(s.optString("from")) ?: return@mapNotNull null
                val to = parseHhMm(s.optString("to")) ?: return@mapNotNull null
                val daysArr = s.optJSONArray("days") ?: return@mapNotNull null
                val days = (0 until daysArr.length()).map { daysArr.optInt(it, -1) }.filter { it in 0..6 }.toSet()
                SmartSlot(s.str("label"), days, from, to, targets(s.optJSONArray("targets")))
            }
        } ?: emptyList()
        val kind = o.str("kind")
        if (kind !in setOf("single", "multi", "smart")) return null
        return WidgetConfig(
            id = o.str("id").ifEmpty { return null },
            name = o.str("name"),
            kind = kind,
            targets = targets(o.optJSONArray("targets")),
            slots = slots,
            fallbackTargets = targets(o.optJSONArray("fallbackTargets")),
            maxRows = display.optInt("maxRows", 3).coerceIn(1, 6),
            showSecondArrival = display.optBoolean("showSecondArrival", true),
        )
    }

    fun parseStore(json: String?): WidgetStore? = runCatching {
        val o = JSONObject(json ?: return null)
        if (o.optInt("version") != VERSION) return null
        val arr = o.optJSONArray("configs") ?: JSONArray()
        WidgetStore(
            apiBase = o.str("apiBase").trimEnd('/'),
            configs = (0 until arr.length()).mapNotNull { arr.optJSONObject(it)?.let(::config) },
            savedAt = o.optLong("savedAt"),
        )
    }.getOrNull()

    fun parseSnapshots(json: String?): List<QuerySnapshot> = runCatching {
        val o = JSONObject(json ?: return emptyList())
        if (o.optInt("version") != VERSION) return emptyList()
        val arr = o.optJSONArray("snapshots") ?: return emptyList()
        (0 until arr.length()).mapNotNull { i ->
            val s = arr.optJSONObject(i) ?: return@mapNotNull null
            val arrivals = s.optJSONArray("arrivals") ?: JSONArray()
            QuerySnapshot(
                stopId = s.str("stopId"),
                lineCode = s.str("lineCode"),
                fetchedAt = s.optLong("fetchedAt"),
                error = if (s.isNull("error")) null else s.str("error").ifEmpty { null },
                arrivals = (0 until arrivals.length()).mapNotNull { j ->
                    val a = arrivals.optJSONObject(j) ?: return@mapNotNull null
                    SnapshotArrival(
                        lineCode = a.str("lineCode"),
                        destination = a.str("destination"),
                        etaMinutes = if (a.isNull("etaMinutes")) null else a.optInt("etaMinutes"),
                        status = EtaStatus.fromWire(a.optString("status")),
                        vehicleId = if (a.isNull("vehicleId")) null else a.str("vehicleId").ifEmpty { null },
                    )
                },
            )
        }
    }.getOrDefault(emptyList())

    fun snapshotsToJson(snapshots: Collection<QuerySnapshot>): String {
        val arr = JSONArray()
        for (s in snapshots) {
            val arrivals = JSONArray()
            for (a in s.arrivals) {
                arrivals.put(
                    JSONObject()
                        .put("lineCode", a.lineCode)
                        .put("destination", a.destination)
                        .put("etaMinutes", a.etaMinutes ?: JSONObject.NULL)
                        .put("status", a.status.wire)
                        .put("vehicleId", a.vehicleId ?: JSONObject.NULL),
                )
            }
            arr.put(
                JSONObject()
                    .put("stopId", s.stopId)
                    .put("lineCode", s.lineCode)
                    .put("fetchedAt", s.fetchedAt)
                    .put("error", s.error ?: JSONObject.NULL)
                    .put("arrivals", arrivals),
            )
        }
        return JSONObject().put("version", VERSION).put("snapshots", arr).toString()
    }
}
