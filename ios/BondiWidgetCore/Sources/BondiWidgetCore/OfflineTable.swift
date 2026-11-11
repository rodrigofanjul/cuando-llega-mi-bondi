import Foundation

/// Tabla offline v1 que escribe la web (features/offline/lib/widgetTable.ts) y
/// espejo de OfflineTable.kt. El tipo de día ya viene resuelto por día local.
/// Paridad: shared/contracts/offline-vectors.json.
public struct OfflineHint: Equatable {
    public let medianMin: Int
    public let highMin: Int
    public let days: Int

    public init(medianMin: Int, highMin: Int, days: Int) {
        self.medianMin = medianMin
        self.highMin = highMin
        self.days = days
    }
}

public struct OfflineTable: Equatable {
    public static let version = 1
    private static let arOffsetMs: Int64 = -3 * 60 * 60_000
    private static let dayMs: Int64 = 86_400_000

    public let profileVersion: String
    public let dataSource: String
    public let syncedAt: Int64
    public let binMinutes: Int
    public let firstDay: Int64
    public let dayTypes: [String]
    /// "parada|línea" → tipo de día → franja → pista.
    public let entries: [String: [String: [Int: OfflineHint]]]

    public static func arDay(_ now: Int64) -> Int64 {
        let local = now + arOffsetMs
        return local >= 0 ? local / dayMs : -((-local + dayMs - 1) / dayMs)
    }

    public func lookup(stopId: String, lineCode: String, now: Int64) -> OfflineHint? {
        let idx = OfflineTable.arDay(now) - firstDay
        guard idx >= 0, idx < Int64(dayTypes.count),
              let bins = entries[QuerySnapshot.key(stopId, lineCode)]?[dayTypes[Int(idx)]] else { return nil }
        let b = WidgetRows.arLocal(now).minute / binMinutes
        return bins[b] ?? bins[b - 1] ?? bins[b + 1]
    }

    /// Lectura defensiva: versión desconocida o JSON roto → nil (el widget no estima).
    public static func parse(_ data: Data?) -> OfflineTable? {
        guard let data,
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (o["version"] as? NSNumber)?.intValue == version,
              let firstDay = (o["firstDay"] as? NSNumber)?.int64Value,
              let dayTypes = o["dayTypes"] as? [String] else { return nil }
        let binMinutes = (o["binMinutes"] as? NSNumber)?.intValue ?? 15
        guard (1...60).contains(binMinutes) else { return nil }
        var entries: [String: [String: [Int: OfflineHint]]] = [:]
        for (key, raw) in (o["entries"] as? [String: Any]) ?? [:] {
            var byType: [String: [Int: OfflineHint]] = [:]
            for (type, rawBins) in (raw as? [String: Any]) ?? [:] {
                var bins: [Int: OfflineHint] = [:]
                for item in (rawBins as? [Any]) ?? [] {
                    guard let raw = item as? [Any] else { continue }
                    let v = raw.compactMap { ($0 as? NSNumber)?.intValue }
                    guard v.count >= 4, v.count == raw.count else { continue }
                    bins[v[0]] = OfflineHint(medianMin: v[1], highMin: v[2], days: v[3])
                }
                byType[type] = bins
            }
            entries[key] = byType
        }
        return OfflineTable(
            profileVersion: (o["profileVersion"] as? String) ?? "",
            dataSource: (o["dataSource"] as? String) ?? "",
            syncedAt: (o["syncedAt"] as? NSNumber)?.int64Value ?? 0,
            binMinutes: binMinutes,
            firstDay: firstDay,
            dayTypes: dayTypes,
            entries: entries)
    }
}
