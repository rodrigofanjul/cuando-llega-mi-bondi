import Foundation

/// Contrato v1 escrito por la web (features/widgets/native/payload.ts).
/// Decodificación defensiva: entradas inválidas se descartan.
public struct WidgetTarget: Codable, Equatable, Hashable {
    public let stopId: String
    public let stopLabel: String
    public let lineCode: String
    public let lineLabel: String
    public let destination: String

    public init(stopId: String, stopLabel: String, lineCode: String, lineLabel: String, destination: String = "") {
        self.stopId = stopId
        self.stopLabel = stopLabel
        self.lineCode = lineCode
        self.lineLabel = lineLabel
        self.destination = destination
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        stopId = try c.decode(String.self, forKey: .stopId)
        stopLabel = (try? c.decode(String.self, forKey: .stopLabel)) ?? ""
        lineCode = try c.decode(String.self, forKey: .lineCode)
        lineLabel = (try? c.decode(String.self, forKey: .lineLabel)) ?? ""
        destination = (try? c.decode(String.self, forKey: .destination)) ?? ""
    }
}

public struct SmartSlot: Equatable {
    public let label: String
    public let days: Set<Int>
    public let from: Int
    public let to: Int
    public let targets: [WidgetTarget]

    public init(label: String, days: Set<Int>, from: Int, to: Int, targets: [WidgetTarget]) {
        self.label = label
        self.days = days
        self.from = from
        self.to = to
        self.targets = targets
    }
}

public struct WidgetConfig: Equatable {
    public let id: String
    public let name: String
    public let kind: String
    public let targets: [WidgetTarget]
    public let slots: [SmartSlot]
    public let fallbackTargets: [WidgetTarget]
    public let maxRows: Int
    public let showSecondArrival: Bool
}

public struct WidgetStore: Equatable {
    public let apiBase: String
    public let configs: [WidgetConfig]
    public let savedAt: Int64
}

public struct SnapshotArrival: Codable, Equatable {
    public let lineCode: String
    public let destination: String
    public let etaMinutes: Int?
    public let status: EtaStatus
    public let vehicleId: String?

    public init(lineCode: String, destination: String, etaMinutes: Int?, status: EtaStatus, vehicleId: String?) {
        self.lineCode = lineCode
        self.destination = destination
        self.etaMinutes = etaMinutes
        self.status = status
        self.vehicleId = vehicleId
    }
}

public struct QuerySnapshot: Codable, Equatable {
    public let stopId: String
    public let lineCode: String
    public let fetchedAt: Int64
    public let error: String?
    public let arrivals: [SnapshotArrival]

    public init(stopId: String, lineCode: String, fetchedAt: Int64, error: String?, arrivals: [SnapshotArrival]) {
        self.stopId = stopId
        self.lineCode = lineCode
        self.fetchedAt = fetchedAt
        self.error = error
        self.arrivals = arrivals
    }

    public var key: String { Self.key(stopId, lineCode) }
    public static func key(_ stopId: String, _ lineCode: String) -> String { "\(stopId)|\(lineCode)" }
}

public struct SnapshotPayload: Codable, Equatable {
    public let version: Int
    public let snapshots: [QuerySnapshot]

    public init(snapshots: [QuerySnapshot]) {
        version = WidgetJson.version
        self.snapshots = snapshots
    }
}

public enum WidgetJson {
    public static let version = 1

    public static func parseHhMm(_ value: String?) -> Int? {
        guard let value, value.count == 5 else { return nil }
        let parts = value.split(separator: ":")
        guard parts.count == 2, parts[0].count == 2, parts[1].count == 2,
              let h = Int(parts[0]), let m = Int(parts[1]), (0...23).contains(h), (0...59).contains(m) else { return nil }
        return h * 60 + m
    }

    private static func string(_ o: [String: Any], _ key: String) -> String {
        ((o[key] as? String) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func targets(_ raw: Any?) -> [WidgetTarget] {
        guard let arr = raw as? [[String: Any]] else { return [] }
        return arr.compactMap { o in
            let t = WidgetTarget(
                stopId: string(o, "stopId"), stopLabel: string(o, "stopLabel"),
                lineCode: string(o, "lineCode"), lineLabel: string(o, "lineLabel"),
                destination: string(o, "destination"))
            return t.stopId.isEmpty || t.lineCode.isEmpty ? nil : t
        }
    }

    private static func config(_ o: [String: Any]) -> WidgetConfig? {
        guard (o["version"] as? Int) == version else { return nil }
        let id = string(o, "id")
        let kind = string(o, "kind")
        guard !id.isEmpty, ["single", "multi", "smart"].contains(kind) else { return nil }
        let display = (o["display"] as? [String: Any]) ?? [:]
        let slots: [SmartSlot] = ((o["slots"] as? [[String: Any]]) ?? []).compactMap { s in
            guard let from = parseHhMm(s["from"] as? String), let to = parseHhMm(s["to"] as? String),
                  let days = s["days"] as? [Int] else { return nil }
            return SmartSlot(label: string(s, "label"), days: Set(days.filter { (0...6).contains($0) }),
                             from: from, to: to, targets: targets(s["targets"]))
        }
        return WidgetConfig(
            id: id, name: string(o, "name"), kind: kind,
            targets: targets(o["targets"]), slots: slots, fallbackTargets: targets(o["fallbackTargets"]),
            maxRows: min(6, max(1, (display["maxRows"] as? Int) ?? 3)),
            showSecondArrival: (display["showSecondArrival"] as? Bool) ?? true)
    }

    public static func parseStore(_ data: Data?) -> WidgetStore? {
        guard let data, let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              (o["version"] as? Int) == version else { return nil }
        var base = string(o, "apiBase")
        while base.hasSuffix("/") { base.removeLast() }
        let configs = ((o["configs"] as? [[String: Any]]) ?? []).compactMap(config)
        let savedAt = (o["savedAt"] as? NSNumber)?.int64Value ?? 0
        return WidgetStore(apiBase: base, configs: configs, savedAt: savedAt)
    }

    public static func parseSnapshots(_ data: Data?) -> [QuerySnapshot] {
        guard let data, let payload = try? JSONDecoder().decode(SnapshotPayload.self, from: data),
              payload.version == version else { return [] }
        return payload.snapshots
    }

    public static func encodeSnapshots(_ snapshots: [QuerySnapshot]) -> Data? {
        try? JSONEncoder().encode(SnapshotPayload(snapshots: snapshots))
    }

    /// Misma validación que el cliente web: `CodigoEstado != 0` es error de negocio.
    public static func parseArrivalsResponse(_ data: Data, stopId: String, lineCode: String, now: Int64) -> QuerySnapshot {
        func failure(_ msg: String) -> QuerySnapshot {
            QuerySnapshot(stopId: stopId, lineCode: lineCode, fetchedAt: now, error: msg, arrivals: [])
        }
        guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            return failure("Respuesta inválida")
        }
        let estado = (o["CodigoEstado"] as? Int) ?? (o["codigoEstado"] as? Int) ?? 0
        if estado != 0 {
            let msg = string(o, "MensajeEstado").isEmpty ? string(o, "mensajeEstado") : string(o, "MensajeEstado")
            return failure(msg.isEmpty ? "Sin datos" : msg)
        }
        let arr = (o["arribos"] as? [[String: Any]]) ?? (o["Arribos"] as? [[String: Any]]) ?? []
        let keys = ["DescripcionCartelBandera", "descripcionCartelBandera", "DescripcionBandera",
                    "descripcionBandera", "DescripcionCortaBandera", "descripcionCortaBandera"]
        let arrivals = arr.map { a -> SnapshotArrival in
            let eta = ArrivalParser.parseEta(a["Arribo"] as? String)
            let dest = keys.lazy.map { string(a, $0) }.first { !$0.isEmpty } ?? ""
            let coche = string(a, "IdentificadorCoche")
            return SnapshotArrival(lineCode: lineCode, destination: dest, etaMinutes: eta.minutes,
                                   status: eta.status, vehicleId: coche.isEmpty || coche == "0" ? nil : coche)
        }
        return QuerySnapshot(stopId: stopId, lineCode: lineCode, fetchedAt: now, error: nil, arrivals: arrivals)
    }
}
