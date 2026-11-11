package com.bondimdp.mobile.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.bondimdp.mobile.MainActivity
import com.bondimdp.mobile.widget.data.WidgetStorage
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Elige qué configuración (creada en la app, pantalla /widgets) muestra esta
 * instancia del widget. Las configuraciones se editan en la web para tener una
 * sola UI de selección de líneas/paradas.
 */
class WidgetConfigureActivity : AppCompatActivity() {
    private val scope = MainScope()

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(Activity.RESULT_CANCELED, resultIntent(appWidgetId))
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        val storage = WidgetStorage(this)
        val configs = storage.store()?.configs.orEmpty()
        if (configs.isEmpty()) {
            setContentView(
                TextView(this).apply {
                    text = "Todavía no creaste widgets. Abrí Bondi MDP → Widgets para elegir líneas y paradas."
                    setPadding(48, 48, 48, 48)
                    textSize = 16f
                    setOnClickListener {
                        startActivity(Intent(this@WidgetConfigureActivity, MainActivity::class.java))
                        finish()
                    }
                },
            )
            return
        }

        val list = ListView(this)
        list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, configs.map { "${it.name} · ${kindLabel(it.kind)}" })
        list.setOnItemClickListener { _, _, position, _ ->
            storage.setConfigFor(appWidgetId, configs[position].id)
            scope.launch {
                val glanceId = GlanceAppWidgetManager(this@WidgetConfigureActivity).getGlanceIdBy(appWidgetId)
                BondiWidget().update(this@WidgetConfigureActivity, glanceId)
                RefreshWorker.ensurePeriodic(this@WidgetConfigureActivity)
                RefreshWorker.refreshNow(this@WidgetConfigureActivity)
                setResult(Activity.RESULT_OK, resultIntent(appWidgetId))
                finish()
            }
        }
        setContentView(list)
        title = "Elegí qué mostrar"
    }

    private fun resultIntent(appWidgetId: Int) =
        Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

    private fun kindLabel(kind: String) = when (kind) {
        "single" -> "una línea"
        "multi" -> "varias líneas"
        else -> "inteligente"
    }
}
