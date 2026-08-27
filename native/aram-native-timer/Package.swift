// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AramNativeTimer",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "AramNativeTimerPlugin", targets: ["AramNativeTimerPlugin"]),
        .library(name: "AramTimerActivityModel", targets: ["AramTimerActivityModel"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "AramTimerActivityModel",
            path: "ios/Sources/AramTimerActivityModel"
        ),
        .target(
            name: "AramNativeTimerPlugin",
            dependencies: [
                "AramTimerActivityModel",
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/AramNativeTimerPlugin",
            resources: [.process("Resources")]
        )
    ]
)
