import Foundation
import XCTest
@testable import BondiWidgetCore

/// Ejecuta shared/contracts/offline-vectors.json (mismo archivo que vitest y OfflineTableTest.kt).
final class OfflineTableTests: XCTestCase {
    private func vectors() throws -> [String: Any] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("shared/contracts/offline-vectors.json"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func table() throws -> OfflineTable {
        let raw = try XCTUnwrap(vectors()["table"])
        return try XCTUnwrap(OfflineTable.parse(try JSONSerialization.data(withJSONObject: raw)))
    }

    private func cases() throws -> [[String: Any]] {
        try XCTUnwrap(vectors()["cases"] as? [[String: Any]])
    }

    private func firstHitTime() throws -> Int64 {
        let c = try XCTUnwrap(cases().first { !($0["expected"] is NSNull) })
        return try XCTUnwrap((c["now"] as? NSNumber)?.int64Value)
    }

    private let target = WidgetTarget(stopId: "A-S1", stopLabel: "Parada", lineCode: "A", lineLabel: "A")

    func testSharedVectors() throws {
        let t = try table()
        var hits = 0
        for (i, c) in try cases().enumerated() {
            let now = try XCTUnwrap((c["now"] as? NSNumber)?.int64Value)
            let got = t.lookup(stopId: try XCTUnwrap(c["stopId"] as? String), lineCode: try XCTUnwrap(c["lineCode"] as? String), now: now)
            var expected: OfflineHint?
            if let e = c["expected"] as? [String: Any] {
                expected = OfflineHint(medianMin: (e["medianMin"] as? NSNumber)?.intValue ?? -1,
                                       highMin: (e["highMin"] as? NSNumber)?.intValue ?? -1,
                                       days: (e["days"] as? NSNumber)?.intValue ?? -1)
            }
            XCTAssertEqual(got, expected, "caso \(i) now=\(now)")
            if got != nil { hits += 1 }
        }
        XCTAssertGreaterThan(hits, 20)
    }

    func testInvalidOrUnknownVersionIsIgnored() {
        XCTAssertNil(OfflineTable.parse(nil))
        XCTAssertNil(OfflineTable.parse(Data("{roto".utf8)))
        XCTAssertNil(OfflineTable.parse(Data(#"{"version":2,"firstDay":1,"dayTypes":[],"entries":{}}"#.utf8)))
    }

    func testLiveDataWinsOverEstimate() throws {
        let now = try firstHitTime()
        let snap = QuerySnapshot(stopId: "A-S1", lineCode: "A", fetchedAt: now, error: nil,
                                 arrivals: [SnapshotArrival(lineCode: "A", destination: "X", etaMinutes: 7, status: .minutes, vehicleId: nil)])
        let row = WidgetRows.buildRow(target, index: [snap.key: snap], now: now, offline: try table())
        XCTAssertEqual(row.state, .ok)
        XCTAssertNil(row.offline)
    }

    func testEstimateOnlyWhenLiveUnusable() throws {
        let now = try firstHitTime()
        let t = try table()
        let missing = WidgetRows.buildRow(target, index: [:], now: now, offline: t)
        XCTAssertEqual(missing.state, .offlineEstimate)
        XCTAssertNotNil(missing.offline)

        let old = QuerySnapshot(stopId: "A-S1", lineCode: "A", fetchedAt: now - 15 * 60_000, error: nil,
                                arrivals: [SnapshotArrival(lineCode: "A", destination: "X", etaMinutes: 3, status: .minutes, vehicleId: nil)])
        XCTAssertEqual(WidgetRows.buildRow(target, index: [old.key: old], now: now, offline: t).state, .offlineEstimate)

        let err = QuerySnapshot(stopId: "A-S1", lineCode: "A", fetchedAt: now, error: "Sin conexión", arrivals: [])
        XCTAssertEqual(WidgetRows.buildRow(target, index: [err.key: err], now: now, offline: t).state, .offlineEstimate)

        // Dato fresco sin arribos: manda el dato en vivo, no la estimación.
        let none = QuerySnapshot(stopId: "A-S1", lineCode: "A", fetchedAt: now, error: nil, arrivals: [])
        XCTAssertEqual(WidgetRows.buildRow(target, index: [none.key: none], now: now, offline: t).state, .noService)

        XCTAssertEqual(WidgetRows.buildRow(target, index: [:], now: now).state, .missing)
    }

    func testNoEstimateOutsideHorizon() throws {
        let t = try table()
        let late = t.firstDay * 86_400_000 + 3 * 3_600_000 + 30 * 86_400_000 + 12 * 3_600_000
        XCTAssertEqual(WidgetRows.buildRow(target, index: [:], now: late, offline: t).state, .missing)
    }
}
