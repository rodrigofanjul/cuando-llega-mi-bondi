// swift-tools-version:5.9
// Lógica pura de los widgets iOS (espejo de features/widgets/lib y de la versión Kotlin).
// `swift test` corre en macOS y Linux. Los mismos archivos se compilan dentro del
// target WidgetKit (ver ios/scripts/add_widget_target.rb).
import PackageDescription

let package = Package(
    name: "BondiWidgetCore",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "BondiWidgetCore", targets: ["BondiWidgetCore"])],
    targets: [
        .target(name: "BondiWidgetCore"),
        .testTarget(name: "BondiWidgetCoreTests", dependencies: ["BondiWidgetCore"]),
    ]
)
