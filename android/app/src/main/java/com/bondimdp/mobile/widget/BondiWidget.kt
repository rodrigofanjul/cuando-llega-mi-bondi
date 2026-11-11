package com.bondimdp.mobile.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalSize
import androidx.glance.currentState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.bondimdp.mobile.MainActivity
import com.bondimdp.mobile.widget.core.RowState
import com.bondimdp.mobile.widget.core.WidgetRow
import com.bondimdp.mobile.widget.core.WidgetRows
import com.bondimdp.mobile.widget.core.WidgetView
import com.bondimdp.mobile.widget.data.WidgetStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val SMALL = DpSize(110.dp, 50.dp)
private val MEDIUM = DpSize(250.dp, 110.dp)
private val LARGE = DpSize(250.dp, 220.dp)

sealed interface WidgetUiState {
    data object NotConfigured : WidgetUiState
    data class Ready(val view: WidgetView, val now: Long) : WidgetUiState
}

class BondiWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
        // Precalentar el almacenamiento fuera del hilo principal.
        withContext(Dispatchers.IO) { WidgetStorage(context).store() }
        provideContent {
            // Leer la versión del estado de Glance fuerza la recomposición cuando
            // refreshAll() la cambia; los datos se recargan en cada composición
            // (si se cargaran antes de provideContent quedarían congelados).
            @Suppress("UNUSED_VARIABLE")
            val version = currentState(DATA_VERSION) ?: 0L
            GlanceTheme { WidgetContent(loadState(context, appWidgetId)) }
        }
    }

    companion object {
        private val DATA_VERSION = longPreferencesKey("bondi_data_version")

        /** Marca datos nuevos y redibuja todas las instancias. */
        suspend fun refreshAll(context: Context) {
            val stamp = System.currentTimeMillis()
            for (id in GlanceAppWidgetManager(context).getGlanceIds(BondiWidget::class.java)) {
                updateAppWidgetState(context, id) { prefs -> prefs[DATA_VERSION] = stamp }
                BondiWidget().update(context, id)
            }
        }
    }

    private fun loadState(context: Context, appWidgetId: Int): WidgetUiState {
        val storage = WidgetStorage(context)
        val store = storage.store() ?: return WidgetUiState.NotConfigured
        // `configuration_optional`: sin elección explícita se usa la primera configuración.
        val config = store.configs.firstOrNull { it.id == storage.configIdFor(appWidgetId) }
            ?: store.configs.firstOrNull()
            ?: return WidgetUiState.NotConfigured
        val now = System.currentTimeMillis()
        return WidgetUiState.Ready(WidgetRows.resolve(config, storage.snapshots(), now, storage.offlineTable()), now)
    }
}

class BondiWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BondiWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshWorker.ensurePeriodic(context)
        RefreshWorker.refreshNow(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        RefreshWorker.cancelAll(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        val storage = WidgetStorage(context)
        appWidgetIds.forEach(storage::removeInstance)
    }
}

class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        RefreshWorker.refresh(context)
    }
}

/** HH:MM en hora de Mar del Plata. */
internal fun formatClock(epochMs: Long): String {
    val (_, minute) = WidgetRows.arLocal(epochMs)
    return "%02d:%02d".format(minute / 60, minute % 60)
}

/** «menos de un minuto», «1 minuto», «N minutos» para lectores de pantalla. */
internal fun spokenMinutes(m: Int): String = when (m) {
    0 -> "menos de un minuto"
    1 -> "1 minuto"
    else -> "$m minutos"
}

internal fun minutesLabel(row: WidgetRow): String = when (row.state) {
    RowState.OK -> when {
        row.nextArriving -> "Llegando"
        row.nextMinutes == 0 -> "< 1 min"
        else -> "${row.nextMinutes} min"
    }
    RowState.NO_SERVICE -> "Sin arribos"
    RowState.MISSING -> "Sin datos"
    RowState.STALE -> "Vencido"
    RowState.ERROR -> "—"
    // «≈»: nunca se confunde con un arribo en vivo.
    RowState.OFFLINE_ESTIMATE -> "≈${row.offline?.medianMin ?: 0} min"
}

internal fun accessibilityLabel(row: WidgetRow): String {
    val base = "Línea ${row.target.lineLabel}, ${row.target.destination.ifEmpty { "cualquier sentido" }}, parada ${row.target.stopLabel}"
    return when (row.state) {
        RowState.OK -> {
            val next = if (row.nextArriving) "llegando" else "llega en ${spokenMinutes(row.nextMinutes ?: 0)}"
            val second = row.secondMinutes?.let { ", el siguiente en ${spokenMinutes(it)}" }.orEmpty()
            "$base, $next$second"
        }
        RowState.STALE -> "$base, dato vencido"
        RowState.MISSING -> "$base, sin datos todavía"
        RowState.NO_SERVICE -> "$base, sin arribos informados"
        RowState.ERROR -> "$base, ${row.note}"
        RowState.OFFLINE_ESTIMATE -> {
            val hint = row.offline
            "$base, sin datos en vivo. Estimación histórica: alrededor de ${spokenMinutes(hint?.medianMin ?: 0)}, " +
                "hasta ${spokenMinutes(hint?.highMin ?: 0)}"
        }
    }
}

@Composable
private fun WidgetContent(state: WidgetUiState) {
    val open = actionStartActivity<MainActivity>()
    val container = GlanceModifier
        .fillMaxSize()
        .background(GlanceTheme.colors.widgetBackground)
        .cornerRadius(16.dp)
        .padding(10.dp)
        .clickable(open)

    when (state) {
        WidgetUiState.NotConfigured -> Column(container, verticalAlignment = Alignment.CenterVertically) {
            Text("Bondi MDP", style = TextStyle(fontWeight = FontWeight.Bold, color = GlanceTheme.colors.onSurface))
            Text(
                "Tocá para elegir línea y parada en la app",
                style = TextStyle(fontSize = 12.sp, color = GlanceTheme.colors.onSurfaceVariant),
            )
        }
        is WidgetUiState.Ready -> ReadyContent(state, container)
    }
}

@Composable
private fun ReadyContent(state: WidgetUiState.Ready, modifier: GlanceModifier) {
    val size = LocalSize.current
    val rowsThatFit = when {
        size.height >= LARGE.height -> state.view.rows.size
        size.height >= MEDIUM.height -> minOf(3, state.view.rows.size)
        else -> minOf(1, state.view.rows.size)
    }
    val compact = size.width < MEDIUM.width
    Column(modifier) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                state.view.context ?: state.view.title,
                maxLines = 1,
                style = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, color = GlanceTheme.colors.onSurface),
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                "↻",
                style = TextStyle(fontSize = 16.sp, color = GlanceTheme.colors.primary),
                modifier = GlanceModifier
                    .padding(start = 8.dp)
                    .clickable(actionRunCallback<RefreshAction>())
                    .semantics { contentDescription = "Actualizar" },
            )
        }
        Spacer(GlanceModifier.height(4.dp))
        if (state.view.rows.isEmpty()) {
            Text(
                "Sin recorrido para este horario",
                style = TextStyle(fontSize = 12.sp, color = GlanceTheme.colors.onSurfaceVariant),
            )
        }
        state.view.rows.take(rowsThatFit).forEach { row -> ArrivalRow(row, compact) }
        Spacer(GlanceModifier.defaultWeight())
        Footer(state)
    }
}

@Composable
private fun ArrivalRow(row: WidgetRow, compact: Boolean) {
    val emphasis = if (row.state == RowState.OK) GlanceTheme.colors.primary else GlanceTheme.colors.onSurfaceVariant
    Row(
        GlanceModifier.fillMaxWidth().padding(vertical = 3.dp).semantics { contentDescription = accessibilityLabel(row) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            row.target.lineLabel,
            style = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold, color = GlanceTheme.colors.onSurface),
            modifier = GlanceModifier.padding(end = 8.dp),
        )
        Column(GlanceModifier.defaultWeight()) {
            Text(
                row.target.destination.ifEmpty { row.target.stopLabel },
                maxLines = 1,
                style = TextStyle(fontSize = 12.sp, color = GlanceTheme.colors.onSurface),
            )
            if (!compact) {
                Text(
                    row.target.stopLabel,
                    maxLines = 1,
                    style = TextStyle(fontSize = 11.sp, color = GlanceTheme.colors.onSurfaceVariant),
                )
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(minutesLabel(row), style = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold, color = emphasis))
            if (!compact && row.state == RowState.OFFLINE_ESTIMATE) {
                Text(
                    "histórico · hasta ${row.offline?.highMin ?: 0}",
                    style = TextStyle(fontSize = 11.sp, color = GlanceTheme.colors.onSurfaceVariant),
                )
            } else if (!compact && row.state == RowState.OK && row.secondMinutes != null) {
                Text(
                    "luego ${row.secondMinutes} min",
                    style = TextStyle(fontSize = 11.sp, color = GlanceTheme.colors.onSurfaceVariant),
                )
            }
        }
    }
}

@Composable
private fun Footer(state: WidgetUiState.Ready) {
    val updated = state.view.oldestUpdate
    val stale = state.view.rows.any { it.state == RowState.STALE }
    val error = state.view.rows.firstNotNullOfOrNull { it.note }
    val estimated = state.view.rows.any { it.state == RowState.OFFLINE_ESTIMATE }
    val text = when {
        estimated -> "Sin datos en vivo · estimación histórica"
        updated == null -> "Esperando primera actualización"
        stale -> "Dato de las ${formatClock(updated)} · abrí la app"
        error != null -> "${formatClock(updated)} · $error"
        else -> "Actualizado ${formatClock(updated)}"
    }
    Text(text, maxLines = 1, style = TextStyle(fontSize = 10.sp, color = GlanceTheme.colors.onSurfaceVariant))
}
