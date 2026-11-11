import Foundation
import XCTest
@testable import BondiWidgetCore

/// Ejecuta shared/contracts/arrival-vectors.json y casos espejo de widgets.test.ts / WidgetRowsTest.kt.
final class BondiWidgetCoreTests: XCTestCase {
    private let min: Int64 = 60_000
    private let now: Int64 = 1_794_397_500_000 // miércoles 2026-11-11 08:45 MDP

    private func vectors() throws -> [String: Any] {
        // ios/BondiWidgetCore/Tests/BondiWidgetCoreTests/<este archivo> → raíz del repo
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let data = try Data(contentsOf: root.appendingPathComponent("shared/contracts/arrival-vectors.json"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func testEtaVectors() throws {
        for v in try XCTUnwrap(vectors()["eta"] as? [[String: Any]]) {
            let raw = v["raw"] as? String ?? ""
            let eta = ArrivalParser.parseEta(raw)
            XCTAssertEqual(eta.minutes, v["minutes"] as? Int, "raw=\(raw)")
            XCTAssertEqual(eta.status.rawValue, v["status"] as? String, "raw=\(raw)")
        }
    }

    func testDeviationVectors() throws {
        for v in try XCTUnwrap(vectors()["deviation"] as? [[String: Any]]) {
            let raw = v["raw"] as? String ?? ""
            XCTAssertEqual(ArrivalParser.parseDeviationMinutes(raw), v["minutes"] as? Int, "raw=\(raw)")
        }
    }

    func testFreshnessAndProjection() {
        XCTAssertEqual(ArrivalParser.freshness(fetchedAt: 0, now: 2 * min - 1), .fresh)
        XCTAssertEqual(ArrivalParser.freshness(fetchedAt: 0, now: 2 * min), .aging)
        XCTAssertEqual(ArrivalParser.freshness(fetchedAt: 0, now: 10 * min), .stale)
        XCTAssertEqual(ArrivalParser.projectEta(10, fetchedAt: 0, now: 90_000), 8)
        XCTAssertNil(ArrivalParser.projectEta(10, fetchedAt: 0, now: 10 * min))
    }

    private func target(_ s: String, _ l: String, _ d: String = "") -> WidgetTarget {
        WidgetTarget(stopId: s, stopLabel: "Parada \(s)", lineCode: l, lineLabel: l, destination: d)
    }

    private func snap(_ s: String, _ l: String, _ etas: [Int?], at: Int64? = nil) -> QuerySnapshot {
        QuerySnapshot(stopId: s, lineCode: l, fetchedAt: at ?? now, error: nil,
                      arrivals: etas.map { SnapshotArrival(lineCode: l, destination: "A CENTRO", etaMinutes: $0,
                                                           status: $0 == 0 ? .arriving : .minutes, vehicleId: nil) })
    }

    func testLocalTime() {
        let t = WidgetRows.arLocal(now)
        XCTAssertEqual(t.weekday, 3)
        XCTAssertEqual(t.minute, 525)
    }

    func testRowsAndSorting() {
        let idx = [snap("P1", "a", [9]), snap("P2", "b", [2]), snap("P3", "c", [])].reduce(into: [String: QuerySnapshot]()) { $0[$1.key] = $1 }
        let rows = [target("P3", "c"), target("P1", "a"), target("P4", "d"), target("P2", "b")].map { WidgetRows.buildRow($0, index: idx, now: now) }
        XCTAssertEqual(WidgetRows.sortRows(rows).map(\.target.stopId), ["P2", "P1", "P3", "P4"])
        XCTAssertEqual(rows[2].state, .missing)

        let aging = WidgetRows.buildRow(target("P1", "531"), index: ["P1|531": snap("P1", "531", [12, 4, nil], at: now - 2 * min)], now: now)
        XCTAssertEqual(aging.nextMinutes, 2)
        XCTAssertEqual(aging.secondMinutes, 10)
        XCTAssertEqual(aging.state, .ok)

        let stale = WidgetRows.buildRow(target("P1", "531"), index: ["P1|531": snap("P1", "531", [5], at: now - 15 * min)], now: now)
        XCTAssertEqual(stale.state, .stale)
        XCTAssertNil(stale.nextMinutes)
    }

    func testSmartSlots() {
        let slots = [
            SmartSlot(label: "Casa → Trabajo", days: [1, 2, 3, 4, 5], from: 360, to: 600, targets: [target("P1", "531")]),
            SmartSlot(label: "Reunión miércoles", days: [3], from: 510, to: 540, targets: [target("P5", "573")]),
            SmartSlot(label: "Facultad (noche)", days: [3], from: 1320, to: 120, targets: [target("P7", "541")]),
        ]
        XCTAssertEqual(WidgetRows.activeSlot(slots, now: now)?.label, "Reunión miércoles")
        XCTAssertEqual(WidgetRows.activeSlot(slots, now: now + 30 * min)?.label, "Casa → Trabajo")
        let thu0100: Int64 = 1_794_456_000_000
        XCTAssertEqual(WidgetRows.activeSlot(slots, now: thu0100)?.label, "Facultad (noche)")
        XCTAssertNil(WidgetRows.activeSlot(slots, now: thu0100 + 86_400_000))
    }

    func testStoreParsing() throws {
        XCTAssertNil(WidgetJson.parseStore(Data("{roto".utf8)))
        let json = """
        {"version":1,"apiBase":"https://x/api/","savedAt":1,"configs":[
          {"version":1,"id":"w1","name":"Casa","kind":"single","display":{"maxRows":9},
           "targets":[{"stopId":"P1","stopLabel":"Luro","lineCode":"531","lineLabel":"531","destination":""}]},
          {"version":1,"id":"bad","name":"X","kind":"desconocido","targets":[]}]}
        """
        let store = try XCTUnwrap(WidgetJson.parseStore(Data(json.utf8)))
        XCTAssertEqual(store.apiBase, "https://x/api")
        XCTAssertEqual(store.configs.map(\.id), ["w1"])
        XCTAssertEqual(store.configs[0].maxRows, 6)
    }

    func testSnapshotRoundTripAndResponse() throws {
        let original = [snap("P1", "531", [4, nil])]
        XCTAssertEqual(WidgetJson.parseSnapshots(WidgetJson.encodeSnapshots(original)), original)

        let ok = WidgetJson.parseArrivalsResponse(Data("""
        {"CodigoEstado":0,"arribos":[{"Arribo":"Arribando..","IdentificadorCoche":"0"},
         {"Arribo":"12 min. aprox.","DescripcionBandera":"A PUERTO","IdentificadorCoche":"771"}]}
        """.utf8), stopId: "P1", lineCode: "531", now: now)
        XCTAssertEqual(ok.arrivals.map(\.etaMinutes), [0, 12])
        XCTAssertEqual(ok.arrivals.map(\.vehicleId), [nil, "771"])

        let biz = WidgetJson.parseArrivalsResponse(Data(#"{"CodigoEstado":3,"MensajeEstado":"Parada inexistente"}"#.utf8),
                                                   stopId: "P1", lineCode: "531", now: now)
        XCTAssertEqual(biz.error, "Parada inexistente")
    }
}
