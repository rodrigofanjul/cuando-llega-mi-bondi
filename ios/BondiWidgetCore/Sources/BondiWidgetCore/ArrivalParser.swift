import Foundation

/// Espejo de features/arrivals/lib/normalize.ts + freshness.ts.
/// Contrato: shared/contracts/arrival-vectors.json.
public enum EtaStatus: String, Codable, Equatable {
    case arriving, minutes, unknown
}

public struct Eta: Equatable {
    public let minutes: Int?
    public let status: EtaStatus
}

public enum Freshness: Equatable {
    case fresh, aging, stale
}

public enum ArrivalParser {
    private static func regex(_ pattern: String) -> NSRegularExpression {
        // swiftlint:disable:next force_try
        try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    }

    private static let arriving = regex("^(arribando|llegando)\\b")
    private static let hours = regex("^(\\d{1,2})\\s*(?:h|hs|hora|horas)\\b(?:\\s*(\\d{1,2})\\s*min)?")
    private static let minutes = regex("^(\\d{1,3})\\s*min")
    private static let deviation = regex("^([+-]?)(\\d{1,2}):(\\d{2})(?::(\\d{2}))?$")

    private static func groups(_ re: NSRegularExpression, _ text: String) -> [String?]? {
        let range = NSRange(text.startIndex..., in: text)
        guard let m = re.firstMatch(in: text, range: range) else { return nil }
        return (0..<m.numberOfRanges).map { i in
            let r = m.range(at: i)
            guard r.location != NSNotFound, let sr = Range(r, in: text) else { return nil }
            return String(text[sr])
        }
    }

    public static func parseEta(_ raw: String?) -> Eta {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if groups(arriving, text) != nil { return Eta(minutes: 0, status: .arriving) }
        if let g = groups(hours, text), let h = g[1].flatMap(Int.init) {
            let extra = g[2].flatMap(Int.init) ?? 0
            return Eta(minutes: h * 60 + extra, status: .minutes)
        }
        if let g = groups(minutes, text), let m = g[1].flatMap(Int.init) {
            return Eta(minutes: m, status: .minutes)
        }
        return Eta(minutes: nil, status: .unknown)
    }

    public static func parseDeviationMinutes(_ raw: String?) -> Int? {
        let text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let g = groups(deviation, text), let a = g[2].flatMap(Int.init), let b = g[3].flatMap(Int.init) else {
            return nil
        }
        let sign = g[1] == "-" ? -1 : 1
        let mins = g[4] != nil ? a * 60 + b : a
        return mins == 0 ? 0 : sign * mins
    }

    public static let agingMs: Int64 = 2 * 60_000
    public static let staleMs: Int64 = 10 * 60_000

    public static func freshness(fetchedAt: Int64, now: Int64) -> Freshness {
        let age = max(0, now - fetchedAt)
        if age >= staleMs { return .stale }
        if age >= agingMs { return .aging }
        return .fresh
    }

    /// Minutos restantes a `now`; nil si el dato venció o no hay ETA. Redondea hacia abajo.
    public static func projectEta(_ eta: Int?, fetchedAt: Int64, now: Int64) -> Int? {
        guard let eta, freshness(fetchedAt: fetchedAt, now: now) != .stale else { return nil }
        let elapsed = Double(max(0, now - fetchedAt)) / 60_000
        return max(0, Int((Double(eta) - elapsed).rounded(.down)))
    }
}
