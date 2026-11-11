import Capacitor
import Foundation
import WidgetKit

/// Contraparte iOS de features/widgets/native/bridge.ts. Escribe en el App
/// Group compartido con la extensión WidgetKit y pide recargar timelines.
@objc(BondiWidgetPlugin)
public class BondiWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BondiWidgetPlugin"
    public let jsName = "BondiWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveStore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushSnapshots", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reloadWidgets", returnType: CAPPluginReturnPromise),
    ]

    private var defaults: UserDefaults? {
        let configured = (Bundle.main.object(forInfoDictionaryKey: "BondiAppGroup") as? String) ?? ""
        let group = configured.isEmpty ? "group.com.bondimdp.app.dev" : configured
        return UserDefaults(suiteName: group)
    }

    @objc func saveStore(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8) else {
            return call.reject("json requerido")
        }
        guard WidgetJson.parseStore(data) != nil else {
            return call.reject("Configuración de widgets inválida (versión o formato)")
        }
        defaults?.set(data, forKey: "store_v1")
        call.resolve()
    }

    @objc func pushSnapshots(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8) else {
            return call.reject("json requerido")
        }
        let incoming = WidgetJson.parseSnapshots(data)
        var all = Dictionary(WidgetJson.parseSnapshots(defaults?.data(forKey: "snapshots_v1")).map { ($0.key, $0) },
                             uniquingKeysWith: { a, _ in a })
        for s in incoming where (all[s.key]?.fetchedAt ?? .min) <= s.fetchedAt { all[s.key] = s }
        defaults?.set(WidgetJson.encodeSnapshots(Array(all.values)), forKey: "snapshots_v1")
        call.resolve()
    }

    @objc func reloadWidgets(_ call: CAPPluginCall) {
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
