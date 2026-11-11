package com.bondimdp.mobile.widget.core

/**
 * Espejo de features/arrivals/lib/normalize.ts y freshness.ts.
 * Contrato fijado por shared/contracts/arrival-vectors.json (ver ArrivalParserTest).
 * Sin dependencias de Android: se testea en la JVM.
 */
enum class EtaStatus(val wire: String) {
    ARRIVING("arriving"), MINUTES("minutes"), UNKNOWN("unknown");

    companion object {
        fun fromWire(value: String?): EtaStatus = entries.firstOrNull { it.wire == value } ?: UNKNOWN
    }
}

data class Eta(val minutes: Int?, val status: EtaStatus)

enum class Freshness { FRESH, AGING, STALE }

object ArrivalParser {
    private val arriving = Regex("^(arribando|llegando)\\b", RegexOption.IGNORE_CASE)
    private val hours = Regex("^(\\d{1,2})\\s*(?:h|hs|hora|horas)\\b(?:\\s*(\\d{1,2})\\s*min)?", RegexOption.IGNORE_CASE)
    private val minutes = Regex("^(\\d{1,3})\\s*min", RegexOption.IGNORE_CASE)
    private val deviation = Regex("^([+-]?)(\\d{1,2}):(\\d{2})(?::(\\d{2}))?$")

    fun parseEta(raw: String?): Eta {
        val text = raw?.trim().orEmpty()
        if (arriving.containsMatchIn(text)) return Eta(0, EtaStatus.ARRIVING)
        hours.find(text)?.let { m ->
            val h = m.groupValues[1].toInt()
            val extra = m.groupValues[2].takeIf { it.isNotEmpty() }?.toInt() ?: 0
            return Eta(h * 60 + extra, EtaStatus.MINUTES)
        }
        minutes.find(text)?.let { return Eta(it.groupValues[1].toInt(), EtaStatus.MINUTES) }
        return Eta(null, EtaStatus.UNKNOWN)
    }

    fun parseDeviationMinutes(raw: String?): Int? {
        val m = deviation.matchEntire(raw?.trim().orEmpty()) ?: return null
        val sign = if (m.groupValues[1] == "-") -1 else 1
        val mins = if (m.groupValues[4].isNotEmpty()) {
            m.groupValues[2].toInt() * 60 + m.groupValues[3].toInt()
        } else {
            m.groupValues[2].toInt()
        }
        return if (mins == 0) 0 else sign * mins
    }

    const val AGING_MS = 2 * 60_000L
    const val STALE_MS = 10 * 60_000L

    fun freshness(fetchedAt: Long, now: Long): Freshness {
        val age = maxOf(0L, now - fetchedAt)
        return when {
            age >= STALE_MS -> Freshness.STALE
            age >= AGING_MS -> Freshness.AGING
            else -> Freshness.FRESH
        }
    }

    /** Minutos restantes a `now`; null si el dato venció o no hay ETA. Redondea hacia abajo. */
    fun projectEta(etaMinutes: Int?, fetchedAt: Long, now: Long): Int? {
        if (etaMinutes == null || freshness(fetchedAt, now) == Freshness.STALE) return null
        val elapsedMin = maxOf(0L, now - fetchedAt) / 60_000.0
        return maxOf(0, Math.floor(etaMinutes - elapsedMin).toInt())
    }
}
