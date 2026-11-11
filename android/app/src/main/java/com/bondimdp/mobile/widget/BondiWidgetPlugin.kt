package com.bondimdp.mobile.widget

import androidx.glance.appwidget.updateAll
import com.bondimdp.mobile.widget.core.WidgetJson
import com.bondimdp.mobile.widget.data.WidgetStorage
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

/** Contraparte nativa de features/widgets/native/bridge.ts. */
@CapacitorPlugin(name = "BondiWidget")
class BondiWidgetPlugin : Plugin() {
    private val scope = MainScope()
    private val storage by lazy { WidgetStorage(context) }

    @PluginMethod
    fun saveStore(call: PluginCall) {
        val json = call.getString("json") ?: return call.reject("json requerido")
        if (!storage.saveStoreJson(json)) return call.reject("Configuración de widgets inválida (versión o formato)")
        RefreshWorker.ensurePeriodic(context)
        call.resolve()
    }

    @PluginMethod
    fun pushSnapshots(call: PluginCall) {
        val json = call.getString("json") ?: return call.reject("json requerido")
        storage.mergeSnapshots(WidgetJson.parseSnapshots(json))
        call.resolve()
    }

    @PluginMethod
    fun reloadWidgets(call: PluginCall) {
        scope.launch {
            BondiWidget().updateAll(context)
            call.resolve()
        }
    }
}
