package com.bondimdp.mobile

import android.os.Bundle
import com.bondimdp.mobile.widget.BondiWidgetPlugin
import com.bondimdp.mobile.widget.RefreshWorker
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(BondiWidgetPlugin::class.java)
        super.onCreate(savedInstanceState)
    }

    override fun onResume() {
        super.onResume()
        // Actualización al abrir la app (la frecuencia en segundo plano no está garantizada).
        RefreshWorker.refreshNow(this)
    }
}
