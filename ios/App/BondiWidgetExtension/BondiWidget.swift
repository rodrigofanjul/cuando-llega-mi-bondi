import AppIntents
import SwiftUI
import WidgetKit

/// Widget iOS. Las configuraciones las escribe la app (BondiWidgetPlugin) en el
/// App Group; el provider usa el último snapshot y, si está vencido, consulta
/// el mismo endpoint que la web. iOS administra el presupuesto de recargas:
/// no hay frecuencia garantizada, por eso se muestra siempre la hora del dato.
enum SharedStore {
    static let appGroup: String = {
        let configured = (Bundle.main.object(forInfoDictionaryKey: "BondiAppGroup") as? String) ?? ""
        return configured.isEmpty ? "group.com.bondimdp.app.dev" : configured
    }()
    static let storeKey = "store_v1"
    static let snapshotsKey = "snapshots_v1"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func store() -> WidgetStore? { WidgetJson.parseStore(defaults?.data(forKey: storeKey)) }

    static func snapshots() -> [String: QuerySnapshot] {
        Dictionary(WidgetJson.parseSnapshots(defaults?.data(forKey: snapshotsKey)).map { ($0.key, $0) }, uniquingKeysWith: { a, b in a.fetchedAt >= b.fetchedAt ? a : b })
    }

    static func merge(_ incoming: [QuerySnapshot]) {
        var all = snapshots()
        for s in incoming where (all[s.key]?.fetchedAt ?? .min) <= s.fetchedAt {
            if s.error != nil, s.arrivals.isEmpty, let previous = all[s.key] {
                all[s.key] = QuerySnapshot(stopId: previous.stopId, lineCode: previous.lineCode, fetchedAt: previous.fetchedAt, error: s.error, arrivals: previous.arrivals)
            } else {
                all[s.key] = s
            }
        }
        let cutoff = Int64(Date().timeIntervalSince1970 * 1000) - 86_400_000
        defaults?.set(WidgetJson.encodeSnapshots(all.values.filter { $0.fetchedAt >= cutoff }), forKey: snapshotsKey)
    }
}

enum ArrivalsFetcher {
    static let minRefetchMs: Int64 = 90_000
    static let maxQueriesPerRun = 12

    static func fetch(apiBase: String, stopId: String, lineCode: String, now: Int64) async -> QuerySnapshot {
        var comps = URLComponents(string: "\(apiBase)/mgp/RecuperarProximosArribosW")
        comps?.queryItems = [URLQueryItem(name: "identificadorParada", value: stopId), URLQueryItem(name: "codigoLineaParada", value: lineCode)]
        guard let url = comps?.url else {
            return QuerySnapshot(stopId: stopId, lineCode: lineCode, fetchedAt: now, error: "URL inválida", arrivals: [])
        }
        var request = URLRequest(url: url, timeoutInterval: 12)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                return QuerySnapshot(stopId: stopId, lineCode: lineCode, fetchedAt: now, error: "Servicio no disponible (\(http.statusCode))", arrivals: [])
            }
            return WidgetJson.parseArrivalsResponse(data, stopId: stopId, lineCode: lineCode, now: now)
        } catch {
            return QuerySnapshot(stopId: stopId, lineCode: lineCode, fetchedAt: now, error: "Sin conexión", arrivals: [])
        }
    }

    static func refreshIfNeeded(store: WidgetStore, configs: [WidgetConfig]) async {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let existing = SharedStore.snapshots()
        let due = WidgetRows.requiredQueries(configs)
            .filter { q in (existing[QuerySnapshot.key(q.stopId, q.lineCode)].map { now - $0.fetchedAt >= minRefetchMs }) ?? true }
            .prefix(maxQueriesPerRun)
        guard !due.isEmpty, !store.apiBase.isEmpty else { return }
        var results: [QuerySnapshot] = []
        for q in due {
            results.append(await fetch(apiBase: store.apiBase, stopId: q.stopId, lineCode: q.lineCode, now: now))
        }
        SharedStore.merge(results)
    }
}

/// Configuración elegible por instancia (App Intents). Las opciones son las
/// configuraciones creadas en la app (pantalla /widgets).
struct WidgetConfigEntity: AppEntity {
    let id: String
    let name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Widget de Bondi MDP"
    static var defaultQuery = WidgetConfigQuery()
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct WidgetConfigQuery: EntityQuery {
    private func all() -> [WidgetConfigEntity] {
        SharedStore.store()?.configs.map { WidgetConfigEntity(id: $0.id, name: $0.name) } ?? []
    }

    func entities(for identifiers: [String]) async throws -> [WidgetConfigEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [WidgetConfigEntity] { all() }
    func defaultResult() async -> WidgetConfigEntity? { all().first }
}

struct SelectConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Elegí qué mostrar"
    static var description = IntentDescription("Elegí una de las configuraciones creadas en la app.")

    @Parameter(title: "Configuración")
    var config: WidgetConfigEntity?
}

struct BondiEntry: TimelineEntry {
    let date: Date
    let view: WidgetView?
}

struct BondiProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> BondiEntry { BondiEntry(date: Date(), view: nil) }

    func snapshot(for configuration: SelectConfigIntent, in context: Context) async -> BondiEntry {
        entry(at: Date(), configId: configuration.config?.id)
    }

    func timeline(for configuration: SelectConfigIntent, in context: Context) async -> Timeline<BondiEntry> {
        if let store = SharedStore.store(), let config = pick(store, configuration.config?.id) {
            await ArrivalsFetcher.refreshIfNeeded(store: store, configs: [config])
        }
        // Entradas por minuto para que "N min" se descuente localmente sin red;
        // a los 10 min el dato pasa a "vencido" (nunca se muestra como actual).
        let start = Date()
        let entries = (0..<11).map { entry(at: start.addingTimeInterval(Double($0) * 60), configId: configuration.config?.id) }
        return Timeline(entries: entries, policy: .after(start.addingTimeInterval(15 * 60)))
    }

    private func pick(_ store: WidgetStore, _ id: String?) -> WidgetConfig? {
        store.configs.first { $0.id == id } ?? store.configs.first
    }

    private func entry(at date: Date, configId: String?) -> BondiEntry {
        guard let store = SharedStore.store(), let config = pick(store, configId) else { return BondiEntry(date: date, view: nil) }
        let now = Int64(date.timeIntervalSince1970 * 1000)
        return BondiEntry(date: date, view: WidgetRows.resolve(config, index: SharedStore.snapshots(), now: now))
    }
}

private func clock(_ ms: Int64) -> String {
    let t = WidgetRows.arLocal(ms)
    return String(format: "%02d:%02d", t.minute / 60, t.minute % 60)
}

/// «menos de un minuto», «1 minuto», «N minutos» para VoiceOver.
private func spokenMinutes(_ m: Int) -> String {
    switch m {
    case 0: return "menos de un minuto"
    case 1: return "1 minuto"
    default: return "\(m) minutos"
    }
}

private func minutesLabel(_ row: WidgetRow) -> String {
    switch row.state {
    case .ok:
        if row.nextArriving { return "Llegando" }
        let minutes = row.nextMinutes ?? 0
        return minutes == 0 ? "< 1 min" : "\(minutes) min"
    case .noService: return "Sin arribos"
    case .missing: return "Sin datos"
    case .stale: return "Vencido"
    case .error: return "—"
    }
}

private func rowAccessibilityLabel(_ row: WidgetRow) -> String {
    let base = "Línea \(row.target.lineLabel), \(row.target.destination.isEmpty ? "cualquier sentido" : row.target.destination), parada \(row.target.stopLabel)"
    switch row.state {
    case .ok:
        let next = row.nextArriving ? "llegando" : "llega en \(spokenMinutes(row.nextMinutes ?? 0))"
        let second = row.secondMinutes.map { ", el siguiente en \(spokenMinutes($0))" } ?? ""
        return "\(base), \(next)\(second)"
    case .stale: return "\(base), dato vencido"
    case .missing: return "\(base), sin datos todavía"
    case .noService: return "\(base), sin arribos informados"
    case .error: return "\(base), \(row.note ?? "error")"
    }
}

struct ArrivalRowView: View {
    let row: WidgetRow
    let compact: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(row.target.lineLabel).font(.headline)
            VStack(alignment: .leading, spacing: 0) {
                Text(row.target.destination.isEmpty ? row.target.stopLabel : row.target.destination)
                    .font(.caption)
                    .lineLimit(1)
                if !compact {
                    Text(row.target.stopLabel).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 0) {
                Text(minutesLabel(row))
                    .font(.headline)
                    .foregroundStyle(row.state == .ok ? Color.accentColor : Color.secondary)
                if !compact, row.state == .ok, let second = row.secondMinutes {
                    Text("luego \(second) min").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rowAccessibilityLabel(row))
    }
}

struct BondiWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BondiEntry

    var body: some View {
        if let view = entry.view {
            content(view)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Bondi MDP").font(.headline)
                Text("Abrí la app → Widgets para elegir línea y parada").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var rowLimit: Int {
        switch family {
        case .systemSmall, .accessoryRectangular: return 1
        case .systemMedium: return 3
        default: return 6
        }
    }

    @ViewBuilder
    private func content(_ view: WidgetView) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(view.context ?? view.title).font(.caption.bold()).lineLimit(1)
            if view.rows.isEmpty {
                Text("Sin recorrido para este horario").font(.caption2).foregroundStyle(.secondary)
            }
            ForEach(Array(view.rows.prefix(rowLimit).enumerated()), id: \.offset) { item in
                ArrivalRowView(row: item.element, compact: family == .systemSmall)
            }
            Spacer(minLength: 0)
            footer(view)
        }
    }

    private func footer(_ view: WidgetView) -> some View {
        let text: String
        if let updated = view.oldestUpdate {
            if view.rows.contains(where: { $0.state == .stale }) {
                text = "Dato de las \(clock(updated)) · abrí la app"
            } else if let note = view.rows.compactMap(\.note).first {
                text = "\(clock(updated)) · \(note)"
            } else {
                text = "Actualizado \(clock(updated))"
            }
        } else {
            text = "Esperando primera actualización"
        }
        return Text(text).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
    }
}

@main
struct BondiWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "BondiWidget", intent: SelectConfigIntent.self, provider: BondiProvider()) { entry in
            BondiWidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Próximo bondi")
        .description("Próximos arribos de tus líneas y paradas, con la hora de la última actualización.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
