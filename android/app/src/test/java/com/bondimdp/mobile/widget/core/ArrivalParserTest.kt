package com.bondimdp.mobile.widget.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/** Ejecuta shared/contracts/arrival-vectors.json (mismo archivo que vitest y XCTest). */
class ArrivalParserTest {
    private val vectors: JSONObject by lazy {
        val path = System.getProperty("bondi.vectors") ?: error("Falta -Dbondi.vectors (ver app/build.gradle)")
        JSONObject(File(path).readText())
    }

    @Test
    fun etaVectors() {
        val arr = vectors.getJSONArray("eta")
        for (i in 0 until arr.length()) {
            val v = arr.getJSONObject(i)
            val expectedMinutes = if (v.isNull("minutes")) null else v.getInt("minutes")
            val eta = ArrivalParser.parseEta(v.getString("raw"))
            assertEquals("raw=${v.getString("raw")}", expectedMinutes, eta.minutes)
            assertEquals("raw=${v.getString("raw")}", v.getString("status"), eta.status.wire)
        }
    }

    @Test
    fun deviationVectors() {
        val arr = vectors.getJSONArray("deviation")
        for (i in 0 until arr.length()) {
            val v = arr.getJSONObject(i)
            val expected = if (v.isNull("minutes")) null else v.getInt("minutes")
            assertEquals("raw=${v.getString("raw")}", expected, ArrivalParser.parseDeviationMinutes(v.getString("raw")))
        }
    }

    @Test
    fun freshnessBorders() {
        val min = 60_000L
        assertEquals(Freshness.FRESH, ArrivalParser.freshness(0, 2 * min - 1))
        assertEquals(Freshness.AGING, ArrivalParser.freshness(0, 2 * min))
        assertEquals(Freshness.STALE, ArrivalParser.freshness(0, 10 * min))
        assertEquals(Freshness.FRESH, ArrivalParser.freshness(5 * min, 0))
    }

    @Test
    fun projection() {
        val min = 60_000L
        assertEquals(7, ArrivalParser.projectEta(10, 0, 3 * min))
        assertEquals(8, ArrivalParser.projectEta(10, 0, 90_000))
        assertEquals(0, ArrivalParser.projectEta(2, 0, 5 * min))
        assertNull(ArrivalParser.projectEta(10, 0, 10 * min))
        assertNull(ArrivalParser.projectEta(null, 0, 0))
    }
}
