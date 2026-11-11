package com.bondimdp.mobile.widget

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.bondimdp.mobile.widget.core.WidgetRows
import com.bondimdp.mobile.widget.data.ArrivalsFetcher
import com.bondimdp.mobile.widget.data.WidgetStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Refresco en segundo plano. Android no garantiza frecuencia: el mínimo de
 * WorkManager es 15 min y Doze puede diferirlo. Por eso el widget siempre
 * muestra la hora del dato y su estado de frescura.
 */
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        refresh(applicationContext)
        return Result.success()
    }

    companion object {
        private const val PERIODIC = "bondi-widget-refresh"
        private const val ONE_SHOT = "bondi-widget-refresh-now"

        suspend fun refresh(context: Context) {
            val storage = WidgetStorage(context)
            val store = storage.store()
            if (store != null && store.apiBase.isNotEmpty() && hasActiveWidgets(context)) {
                val now = System.currentTimeMillis()
                val existing = storage.snapshots()
                val due = WidgetRows.requiredQueries(store.configs)
                    .filter { (stop, line) ->
                        val s = existing["$stop|$line"]
                        s == null || now - s.fetchedAt >= ArrivalsFetcher.MIN_REFETCH_MS
                    }
                    .take(ArrivalsFetcher.MAX_QUERIES_PER_RUN)
                if (due.isNotEmpty()) {
                    val fetcher = ArrivalsFetcher(store.apiBase)
                    val results = withContext(Dispatchers.IO) { due.map { (s, l) -> fetcher.fetch(s, l, now) } }
                    storage.mergeSnapshots(results)
                }
            }
            BondiWidget.refreshAll(context)
        }

        private suspend fun hasActiveWidgets(context: Context): Boolean =
            androidx.glance.appwidget.GlanceAppWidgetManager(context)
                .getGlanceIds(BondiWidget::class.java).isNotEmpty()

        fun ensurePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<RefreshWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun refreshNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<RefreshWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(ONE_SHOT, ExistingWorkPolicy.REPLACE, request)
        }

        fun cancelAll(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        }
    }
}
