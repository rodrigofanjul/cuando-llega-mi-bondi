package com.bondimdp.mobile.widget.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** Ejecuta shared/contracts/offline-vectors.json (mismo archivo que vitest y XCTest). */
class OfflineTableTest {
    private val vectors: JSONObject by lazy {
        val path = System.getProperty("bondi.offlineVectors") ?: error("Falta -Dbondi.offlineVectors (ver app/build.gradle)")
        JSONObject(File(path).readText())
    }
    private val table: OfflineTable by lazy { OfflineTable.parse(vectors.getJSONObject("table").toString())!! }

    @Test
    fun sharedVectors() {
        val cases = vectors.getJSONArray("cases")
        var hits = 0
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val got = table.lookup(c.getString("stopId"), c.getString("lineCode"), c.getLong("now"))
            val expected = if (c.isNull("expected")) null else c.getJSONObject("expected").let {
                OfflineHint(it.getInt("medianMin"), it.getInt("highMin"), it.getInt("days"))
            }
            assertEquals("caso $i (now=${c.getLong("now")})", expected, got)
            if (got != null) hits++
        }
        assert(hits > 20)
    }

    @Test
    fun invalidOrUnknownVersionIsIgnored() {
        assertNull(OfflineTable.parse(null))
        assertNull(OfflineTable.parse("{roto"))
        assertNull(OfflineTable.parse("""{"version":2,"firstDay":1,"dayTypes":[],"entries":{}}"""))
    }

    private val target = WidgetTarget("A-S1", "Parada", "A", "A", "")
    private fun inHorizon(): Long = (0 until vectors.getJSONArray("cases").length())
        .map { vectors.getJSONArray("cases").getJSONObject(it) }
        .first { !it.isNull("expected") }
        .getLong("now")

    @Test
    fun liveDataWinsOverEstimate() {
        val now = inHorizon()
        val snap = QuerySnapshot("A-S1", "A", now, null, listOf(SnapshotArrival("A", "X", 7, EtaStatus.MINUTES, null)))
        val row = WidgetRows.buildRow(target, mapOf(snap.key to snap), now, table)
        assertEquals(RowState.OK, row.state)
        assertNull(row.offline)
    }

    @Test
    fun estimateOnlyWhenLiveUnusable() {
        val now = inHorizon()
        // Nunca hubo dato.
        val missing = WidgetRows.buildRow(target, emptyMap(), now, table)
        assertEquals(RowState.OFFLINE_ESTIMATE, missing.state)
        assertNotNull(missing.offline)
        // Dato vencido (15 min).
        val old = QuerySnapshot("A-S1", "A", now - 15 * 60_000L, null, listOf(SnapshotArrival("A", "X", 3, EtaStatus.MINUTES, null)))
        assertEquals(RowState.OFFLINE_ESTIMATE, WidgetRows.buildRow(target, mapOf(old.key to old), now, table).state)
        // Error sin arribos.
        val err = QuerySnapshot("A-S1", "A", now, "Sin conexión", emptyList())
        assertEquals(RowState.OFFLINE_ESTIMATE, WidgetRows.buildRow(target, mapOf(err.key to err), now, table).state)
        // Dato fresco sin arribos: manda el dato en vivo («sin arribos»), no la estimación.
        val none = QuerySnapshot("A-S1", "A", now, null, emptyList())
        assertEquals(RowState.NO_SERVICE, WidgetRows.buildRow(target, mapOf(none.key to none), now, table).state)
        // Sin tabla: comportamiento anterior.
        assertEquals(RowState.MISSING, WidgetRows.buildRow(target, emptyMap(), now).state)
    }

    @Test
    fun noEstimateOutsideHorizon() {
        val late = table.firstDay * 86_400_000L + 3 * 3_600_000L + 30 * 86_400_000L + 12 * 3_600_000L
        val row = WidgetRows.buildRow(target, emptyMap(), late, table)
        assertEquals(RowState.MISSING, row.state)
    }
}
