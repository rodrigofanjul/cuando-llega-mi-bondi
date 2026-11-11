package com.bondimdp.mobile.widget.core

import org.json.JSONObject

/**
 * Tabla offline v1 que escribe la web (features/offline/lib/widgetTable.ts).
 * El tipo de día ya viene resuelto por día local; acá sólo se busca la franja.
 * Paridad: shared/contracts/offline-vectors.json.
 */
data class OfflineHint(val medianMin: Int, val highMin: Int, val days: Int)

data class OfflineTable(
    val profileVersion: String,
    val dataSource: String,
    val syncedAt: Long,
    val binMinutes: Int,
    val firstDay: Long,
    val dayTypes: List<String>,
    /** "parada|línea" → tipo de día → franja → pista. */
    val entries: Map<String, Map<String, Map<Int, OfflineHint>>>,
) {
    fun lookup(stopId: String, lineCode: String, now: Long): OfflineHint? {
        val idx = arDay(now) - firstDay
        if (idx < 0 || idx >= dayTypes.size) return null
        val bins = entries[QuerySnapshot.key(stopId, lineCode)]?.get(dayTypes[idx.toInt()]) ?: return null
        val (_, minute) = WidgetRows.arLocal(now)
        val b = minute / binMinutes
        return bins[b] ?: bins[b - 1] ?: bins[b + 1]
    }

    companion object {
        const val VERSION = 1
        private const val AR_OFFSET_MS = -3 * 60 * 60_000L
        private const val DAY_MS = 86_400_000L

        fun arDay(now: Long): Long = Math.floorDiv(now + AR_OFFSET_MS, DAY_MS)

        /** Lectura defensiva: versión desconocida o JSON roto → null (el widget no estima). */
        fun parse(json: String?): OfflineTable? = runCatching {
            val o = JSONObject(json ?: return null)
            if (o.optInt("version") != VERSION) return null
            val binMinutes = o.optInt("binMinutes", 15).takeIf { it in 1..60 } ?: return null
            val typesArr = o.optJSONArray("dayTypes") ?: return null
            val dayTypes = (0 until typesArr.length()).map { typesArr.optString(it) }
            val entriesObj = o.optJSONObject("entries") ?: JSONObject()
            val entries = entriesObj.keys().asSequence().associateWith { key ->
                val byType = entriesObj.optJSONObject(key) ?: JSONObject()
                byType.keys().asSequence().associateWith { type ->
                    val arr = byType.optJSONArray(type)
                    if (arr == null) {
                        emptyMap()
                    } else {
                        (0 until arr.length()).mapNotNull { i ->
                            val bin = arr.optJSONArray(i)?.takeIf { it.length() >= 4 } ?: return@mapNotNull null
                            bin.getInt(0) to OfflineHint(bin.getInt(1), bin.getInt(2), bin.getInt(3))
                        }.toMap()
                    }
                }
            }
            OfflineTable(
                profileVersion = o.optString("profileVersion"),
                dataSource = o.optString("dataSource"),
                syncedAt = o.optLong("syncedAt"),
                binMinutes = binMinutes,
                firstDay = o.getLong("firstDay"),
                dayTypes = dayTypes,
                entries = entries,
            )
        }.getOrNull()
    }
}
