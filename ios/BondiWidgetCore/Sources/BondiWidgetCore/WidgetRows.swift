import Foundation

/// Espejo de features/widgets/lib/rows.ts y WidgetRows.kt.
public enum RowState: Equatable {
    case ok, noService, missing, stale, error
}

public struct WidgetRow: Equatable {
    public let target: WidgetTarget
    public let nextMinutes: Int?
    public let secondMinutes: Int?
    public let nextArriving: Bool
    public let freshness: Freshness?
    public let updatedAt: Int64?
    public let note: String?

    public var state: RowState {
        guard let freshness else { return .missing }
        if freshness == .stale { return .stale }
        if note != nil && nextMinutes == nil { return .error }
        if nextMinutes == nil { return .noService }
        return .ok
    }
}

public struct WidgetView: Equatable {
    public let configId: String
    public let title: String
    public let rows: [WidgetRow]
    public let context: String?
    public let oldestUpdate: Int64?
}

public enum WidgetRows {
    private static let arOffsetMs: Int64 = -3 * 60 * 60_000
    private static let dayMs: Int64 = 86_400_000

    /// (díaSemana 0=domingo, minutoDelDía) en hora de Mar del Plata (UTC−3).
    public static func arLocal(_ now: Int64) -> (weekday: Int, minute: Int) {
        let local = now + arOffsetMs
        let days = Int64((Double(local) / Double(dayMs)).rounded(.down))
        let weekday = Int(((days + 4) % 7 + 7) % 7)
        let minute = Int(((local % dayMs) + dayMs) % dayMs / 60_000)
        return (weekday, minute)
    }

    public static func inWindow(_ minute: Int, _ from: Int, _ to: Int) -> Bool {
        if from == to { return true }
        return from < to ? (minute >= from && minute < to) : (minute >= from || minute < to)
    }

    private static func windowLength(_ from: Int, _ to: Int) -> Int {
        if from == to { return 1440 }
        return from < to ? to - from : 1440 - from + to
    }

    public static func activeSlot(_ slots: [SmartSlot], now: Int64) -> SmartSlot? {
        let (weekday, minute) = arLocal(now)
        return slots
            .filter { s in
                let crossed = s.from > s.to && minute < s.to
                let day = crossed ? (weekday + 6) % 7 : weekday
                return s.days.contains(day) && inWindow(minute, s.from, s.to)
            }
            .min { windowLength($0.from, $0.to) < windowLength($1.from, $1.to) }
    }

    public static func buildRow(_ target: WidgetTarget, index: [String: QuerySnapshot], now: Int64) -> WidgetRow {
        guard let snap = index[QuerySnapshot.key(target.stopId, target.lineCode)] else {
            return WidgetRow(target: target, nextMinutes: nil, secondMinutes: nil, nextArriving: false,
                             freshness: nil, updatedAt: nil, note: nil)
        }
        let projected = snap.arrivals
            .filter { $0.lineCode == target.lineCode }
            .filter { target.destination.isEmpty || $0.destination.caseInsensitiveCompare(target.destination) == .orderedSame }
            .compactMap { a in ArrivalParser.projectEta(a.etaMinutes, fetchedAt: snap.fetchedAt, now: now).map { (a, $0) } }
            .sorted { $0.1 < $1.1 }
        let first = projected.first
        return WidgetRow(
            target: target,
            nextMinutes: first?.1,
            secondMinutes: projected.count > 1 ? projected[1].1 : nil,
            nextArriving: first.map { $0.0.status == .arriving && $0.1 == 0 } ?? false,
            freshness: ArrivalParser.freshness(fetchedAt: snap.fetchedAt, now: now),
            updatedAt: snap.fetchedAt,
            note: snap.error)
    }

    /// Cronológico; sin dato al final; estable.
    public static func sortRows(_ rows: [WidgetRow]) -> [WidgetRow] {
        rows.enumerated().sorted { a, b in
            switch (a.element.nextMinutes, b.element.nextMinutes) {
            case (nil, nil): return a.offset < b.offset
            case (nil, _): return false
            case (_, nil): return true
            case let (x?, y?): return x != y ? x < y : a.offset < b.offset
            }
        }.map(\.element)
    }

    public static func resolve(_ config: WidgetConfig, index: [String: QuerySnapshot], now: Int64) -> WidgetView {
        var context: String?
        let targets: [WidgetTarget]
        if config.kind == "smart" {
            let slot = activeSlot(config.slots, now: now)
            context = slot?.label
            targets = slot?.targets ?? config.fallbackTargets
        } else {
            targets = config.targets
        }
        let built = targets.map { buildRow($0, index: index, now: now) }
        let rows = Array((config.kind == "single" ? built : sortRows(built)).prefix(config.maxRows))
        return WidgetView(configId: config.id, title: config.name, rows: rows, context: context,
                          oldestUpdate: rows.compactMap(\.updatedAt).min())
    }

    public static func requiredQueries(_ configs: [WidgetConfig]) -> [(stopId: String, lineCode: String)] {
        var seen = Set<String>()
        var out: [(String, String)] = []
        for c in configs {
            for t in c.targets + c.fallbackTargets + c.slots.flatMap(\.targets) where seen.insert(QuerySnapshot.key(t.stopId, t.lineCode)).inserted {
                out.append((t.stopId, t.lineCode))
            }
        }
        return out
    }
}
