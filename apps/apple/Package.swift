// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CodeEverywhereApple",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "CodeEverywhereAppleCore", targets: ["CodeEverywhereAppleCore"]),
        .library(name: "CodeEverywhereAppleUI", targets: ["CodeEverywhereAppleUI"]),
    ],
    targets: [
        .target(name: "CodeEverywhereAppleCore"),
        .target(name: "CodeEverywhereAppleUI", dependencies: ["CodeEverywhereAppleCore"]),
        .testTarget(name: "CodeEverywhereAppleCoreTests", dependencies: ["CodeEverywhereAppleCore"]),
    ]
)
