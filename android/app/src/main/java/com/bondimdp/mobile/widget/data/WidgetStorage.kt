package com.bondimdp.mobile.widget.data

import android.content.Context
import com.bondimdp.mobile.widget.core.QuerySnapshot
import com.bondimdp.mobile.widget.core.WidgetJson
import com.bondimdp.mobile.widget.core.WidgetStore

/**
 * Caché local de los widgets (SharedPreferences privadas de la app).
 * Guarda configuraciones (escritas por la web vía plugin), el último snapshot
 * por (parada, línea) y qué configuración muestra cada instancia de widget.
 */
class WidgetStorage(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun store(): WidgetStore? = WidgetJson.parseStore(prefs.getString(KEY_STORE, null))

    fun saveStoreJson(json: String): Boolean {
        if (WidgetJson.parseStore(json) == null) return false
        prefs.edit().putString(KEY_STORE, json).apply()
        return true
    }

    fun snapshots(): Map<String, QuerySnapshot> =
        WidgetJson.parseSnapshots(prefs.getString(KEY_SNAPSHOTS, null)).associateBy { it.key }

    /** Fusiona snapshots conservando el más reciente por (parada, línea). */
    @Synchronized
    fun mergeSnapshots(incoming: Collection<QuerySnapshot>) {
        val merged = snapshots().toMutableMap()
        for (s in incoming) {
            val current = merged[s.key]
            if (current == null || s.fetchedAt >= current.fetchedAt) {
                // Un error nuevo no borra arribos previos: el widget los muestra con su hora.
                merged[s.key] = if (s.error != null && s.arrivals.isEmpty() && current != null) {
                    current.copy(error = s.error)
                } else {
                    s
                }
            }
        }
        // Retención: descartar snapshots de más de 24 h.
        val cutoff = System.currentTimeMillis() - 86_400_000L
        val kept = merged.values.filter { it.fetchedAt >= cutoff }
        prefs.edit().putString(KEY_SNAPSHOTS, WidgetJson.snapshotsToJson(kept)).apply()
    }

    fun configIdFor(appWidgetId: Int): String? = prefs.getString("$KEY_INSTANCE$appWidgetId", null)

    fun setConfigFor(appWidgetId: Int, configId: String) {
        prefs.edit().putString("$KEY_INSTANCE$appWidgetId", configId).apply()
    }

    fun removeInstance(appWidgetId: Int) {
        prefs.edit().remove("$KEY_INSTANCE$appWidgetId").apply()
    }

    companion object {
        private const val PREFS = "bondi_widgets"
        private const val KEY_STORE = "store_v1"
        private const val KEY_SNAPSHOTS = "snapshots_v1"
        private const val KEY_INSTANCE = "instance_"
    }
}
