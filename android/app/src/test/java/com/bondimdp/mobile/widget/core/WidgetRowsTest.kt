package com.bondimdp.mobile.widget.core

import com.bondimdp.mobile.widget.data.ArrivalsFetcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** Casos espejo de features/widgets/lib/widgets.test.ts. */
class WidgetRowsTest {
    private val min = 60_000L
    private val now = 1794397500000L // 2026-11-11T11:45Z = miércoles 08:45 en MDP

    private fun target(stop: String, line: String, dest: String = "") = WidgetTarget(stop, "Parada $stop", line, line, dest)

    private fun snap(stop: String, line: String, etas: List<Int?>, fetchedAt: Long = now, error: String? = null) =
        QuerySnapshot(stop, line, fetchedAt, error, etas.map { SnapshotArrival(line, "A CENTRO", it, if (it == 0) EtaStatus.ARRIVING else EtaStatus.MINUTES, null) })

    private fun index(vararg s: QuerySnapshot) = s.associateBy { it.key }

    @Test
    fun localTime() {
        assertEquals(3 to 525, WidgetRows.arLocal(now))
    }

    @Test
    fun nextAndSecondProjected() {
        val row = WidgetRows.buildRow(target("P1", "531"), index(snap("P1", "531", listOf(12, 4, null), now - 2 * min)), now)
        assertEquals(2, row.nextMinutes)
        assertEquals(10, row.secondMinutes)
        assertEquals(Freshness.AGING, row.freshness)
        assertEquals(RowState.OK, row.state)
    }

    @Test
    fun missingAndStale() {
        assertEquals(RowState.MISSING, WidgetRows.buildRow(target("P9", "531"), emptyMap(), now).state)
        val stale = WidgetRows.buildRow(target("P1", "531"), index(snap("P1", "531", listOf(5), now - 15 * min)), now)
        assertNull(stale.nextMinutes)
        assertEquals(RowState.STALE, stale.state)
    }

    @Test
    fun destinationFilter() {
        val s = QuerySnapshot(
            "P1", "531", now, null,
            listOf(
                SnapshotArrival("531", "A PUERTO", 3, EtaStatus.MINUTES, null),
                SnapshotArrival("531", "A CENTRO", 8, EtaStatus.MINUTES, null),
            ),
        )
        assertEquals(8, WidgetRows.buildRow(target("P1", "531", "a centro"), index(s), now).nextMinutes)
    }

    @Test
    fun sortChronologicalWithMissingLast() {
        val idx = index(snap("P1", "a", listOf(9)), snap("P2", "b", listOf(2)), snap("P3", "c", emptyList()))
        val rows = listOf(target("P3", "c"), target("P1", "a"), target("P4", "d"), target("P2", "b")).map { WidgetRows.buildRow(it, idx, now) }
        assertEquals(listOf("P2", "P1", "P3", "P4"), WidgetRows.sortRows(rows).map { it.target.stopId })
    }

    @Test
    fun smartSlots() {
        val slots = listOf(
            SmartSlot("Casa → Trabajo", setOf(1, 2, 3, 4, 5), 360, 600, listOf(target("P1", "531"))),
            SmartSlot("Reunión miércoles", setOf(3), 510, 540, listOf(target("P5", "573"))),
            SmartSlot("Facultad (noche)", setOf(3), 1320, 120, listOf(target("P7", "541"))),
        )
        assertEquals("Reunión miércoles", WidgetRows.activeSlot(slots, now)?.label)
        assertEquals("Casa → Trabajo", WidgetRows.activeSlot(slots, now + 30 * min)?.label)
        val thu0100 = 1794456000000L // 2026-11-12T04:00Z
        assertEquals("Facultad (noche)", WidgetRows.activeSlot(slots, thu0100)?.label)
        assertNull(WidgetRows.activeSlot(slots, thu0100 + 86_400_000L))
    }

    @Test
    fun storeParsingIsDefensive() {
        assertNull(WidgetJson.parseStore("{roto"))
        assertNull(WidgetJson.parseStore("""{"version":2,"configs":[]}"""))
        val store = WidgetJson.parseStore(
            """{"version":1,"apiBase":"https://x/api/","savedAt":1,"configs":[
                {"version":1,"id":"w1","name":"Casa","kind":"single","display":{"maxRows":9},
                 "targets":[{"stopId":"P1","stopLabel":"Luro","lineCode":"531","lineLabel":"531","destination":""}]},
                {"version":1,"id":"bad","name":"X","kind":"desconocido","targets":[]}
            ]}""",
        )
        assertNotNull(store)
        assertEquals("https://x/api", store!!.apiBase)
        assertEquals(listOf("w1"), store.configs.map { it.id })
        assertEquals(6, store.configs[0].maxRows)
    }

    @Test
    fun snapshotJsonRoundTrip() {
        val original = listOf(snap("P1", "531", listOf(4, null), error = "Sin conexión"))
        val parsed = WidgetJson.parseSnapshots(WidgetJson.snapshotsToJson(original))
        assertEquals(original, parsed)
    }

    @Test
    fun fetcherParsesResponseLikeWebClient() {
        val ok = ArrivalsFetcher.parseResponse(
            """{"CodigoEstado":0,"arribos":[
                {"Arribo":"Arribando..","DescripcionCartelBandera":"A CENTRO","IdentificadorCoche":"0"},
                {"Arribo":"12 min. aprox.","DescripcionBandera":"A PUERTO","IdentificadorCoche":"771"}
            ]}""",
            "P1", "531", now,
        )
        assertNull(ok.error)
        assertEquals(listOf(0, 12), ok.arrivals.map { it.etaMinutes })
        assertEquals(listOf(null, "771"), ok.arrivals.map { it.vehicleId })
        assertEquals("A PUERTO", ok.arrivals[1].destination)

        val business = ArrivalsFetcher.parseResponse("""{"CodigoEstado":3,"MensajeEstado":"Parada inexistente"}""", "P1", "531", now)
        assertEquals("Parada inexistente", business.error)
        assertFalse(business.arrivals.isNotEmpty())

        assertEquals("Respuesta inválida", ArrivalsFetcher.parseResponse("<html>", "P1", "531", now).error)
    }
}
