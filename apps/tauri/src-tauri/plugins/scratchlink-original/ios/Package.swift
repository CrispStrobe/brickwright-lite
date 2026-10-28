// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "tauri-plugin-scratchlink-original",
    platforms: [.macOS(.v11), .iOS(.v14)],
    products: [
        .library(name: "tauri-plugin-scratchlink-original", type: .static,
                 targets: ["tauri-plugin-scratchlink-original"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        // Empty modules so the vendored `import` lines resolve without pulling
        // in the Perfect web server. See PerfectWebSockets/Shim.swift.
        .target(name: "PerfectHTTP", path: "Sources/PerfectHTTP"),
        .target(name: "PerfectWebSockets", path: "Sources/PerfectWebSockets"),
        // ONE module, containing both the plugin and the reference sources
        // (generated into Sources/ScratchLinkOriginal/vendored by
        // scripts/gen-scratchlink-swift.mjs — never hand-edited).
        //
        // They cannot be separate targets: the vendored classes are `internal`,
        // so another module cannot see Session or BLESession, and marking them
        // public would edit the pristine tree.
        .target(name: "tauri-plugin-scratchlink-original",
                dependencies: [.byName(name: "Tauri"), "PerfectHTTP", "PerfectWebSockets"],
                path: "Sources/ScratchLinkOriginal"),
    ]
)
