import Capacitor
import UIKit
import WidgetKit

/// Registra plugins locales de la app (Capacitor 8 no los descubre solo).
class BondiBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BondiWidgetPlugin())
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Actualización al abrir la app: los timelines se recalculan con el último dato.
        WidgetCenter.shared.reloadAllTimelines()
    }
}
