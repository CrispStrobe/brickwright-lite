// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "tauri-plugin-depth-capture",
    platforms: [.iOS(.v14)],
    products: [.library(name: "tauri-plugin-depth-capture", type: .static,
                        targets: ["tauri-plugin-depth-capture"])],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [.target(name: "tauri-plugin-depth-capture", dependencies: [.byName(name: "Tauri")],
                      path: "Sources/DepthCapture")]
)
