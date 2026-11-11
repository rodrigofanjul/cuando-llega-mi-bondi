package com.bondimdp.mobile.widget.core

/** Espejo de features/widgets/lib/rows.ts. Reloj inyectado; sin java.time (minSdk 24). */
data class WidgetRow(
    val target: WidgetTarget,
    val nextMinutes: Int?,
    val secondMinutes: Int?,
    val nextArriving: Boolean,
    val freshness: Freshness?,
    val updatedAt: Long?,
    val note: String?,
) {
    val state: RowState
        get() = when {
            freshness == null -> RowState.MISSING
            freshness == Freshness.STALE -> RowState.STALE
            note != null && nextMinutes == null -> RowState.ERROR
            nextMinutes == null -> RowState.NO_SERVICE
            else -> RowState.OK
        }
}

enum class RowState { OK, NO_SERVICE, MISSING, STALE, ERROR }

data class WidgetView(
    val configId: String,
    val title: String,
    val rows: List<WidgetRow>,
    val context: String?,
    val oldestUpdate: Long?,
)

object WidgetRows {
    private const val AR_OFFSET_MS = -3 * 60 * 60_000L
    private const val DAY_MS = 86_400_000L

    /** (díaSemana 0=domingo, minutoDelDía) en hora de Mar del Plata (UTC−3). */
    fun arLocal(now: Long): Pair<Int, Int> {
        val local = now + AR_OFFSET_MS
        val days = Math.floorDiv(local, DAY_MS)
        val weekday = Math.floorMod(days + 4, 7L).toInt() // 1970-01-01 fue jueves
        val minute = (Math.floorMod(local, DAY_MS) / 60_000L).toInt()
        return weekday to minute
    }

    fun inWindow(minute: Int, from: Int, to: Int): Boolean = when {
        from == to -> true
        from < to -> minute in from until to
        else -> minute >= from || minute < to
    }

    private fun windowLength(from: Int, to: Int): Int = when {
        from == to -> 1440
        from < to -> to - from
        else -> 1440 - from + to
    }

    fun activeSlot(slots: List<SmartSlot>, now: Long): SmartSlot? {
        val (weekday, minute) = arLocal(now)
        return slots
            .filter { s ->
                val crossed = s.from > s.to && minute < s.to
                val day = if (crossed) (weekday + 6) % 7 else weekday
                day in s.days && inWindow(minute, s.from, s.to)
            }
            .minByOrNull { windowLength(it.from, it.to) }
    }

    fun buildRow(target: WidgetTarget, index: Map<String, QuerySnapshot>, now: Long): WidgetRow {
        val snap = index[QuerySnapshot.key(target.stopId, target.lineCode)]
            ?: return WidgetRow(target, null, null, false, null, null, null)
        val projected = snap.arrivals
            .filter { it.lineCode == target.lineCode }
            .filter { target.destination.isEmpty() || it.destination.equals(target.destination, ignoreCase = true) }
            .mapNotNull { a -> ArrivalParser.projectEta(a.etaMinutes, snap.fetchedAt, now)?.let { a to it } }
            .sortedBy { it.second }
        val first = projected.getOrNull(0)
        return WidgetRow(
            target = target,
            nextMinutes = first?.second,
            secondMinutes = projected.getOrNull(1)?.second,
            nextArriving = first != null && first.first.status == EtaStatus.ARRIVING && first.second == 0,
            freshness = ArrivalParser.freshness(snap.fetchedAt, now),
            updatedAt = snap.fetchedAt,
            note = snap.error,
        )
    }

    /** Cronológico; sin dato al final; estable. */
    fun sortRows(rows: List<WidgetRow>): List<WidgetRow> =
        rows.withIndex()
            .sortedWith(compareBy<IndexedValue<WidgetRow>>({ it.value.nextMinutes == null }, { it.value.nextMinutes ?: 0 }, { it.index }))
            .map { it.value }

    fun resolve(config: WidgetConfig, index: Map<String, QuerySnapshot>, now: Long): WidgetView {
        var context: String? = null
        val targets = if (config.kind == "smart") {
            val slot = activeSlot(config.slots, now)
            context = slot?.label
            slot?.targets ?: config.fallbackTargets
        } else {
            config.targets
        }
        val built = targets.map { buildRow(it, index, now) }
        val rows = (if (config.kind == "single") built else sortRows(built)).take(config.maxRows)
        return WidgetView(config.id, config.name, rows, context, rows.mapNotNull { it.updatedAt }.minOrNull())
    }

    /** Pares (parada, línea) únicos a consultar para un conjunto de configuraciones. */
    fun requiredQueries(configs: List<WidgetConfig>): List<Pair<String, String>> =
        configs.flatMap { c -> c.targets + c.fallbackTargets + c.slots.flatMap { it.targets } }
            .map { it.stopId to it.lineCode }
            .distinct()
}
