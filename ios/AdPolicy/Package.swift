// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MonjoAdPolicy",
    products: [.library(name: "MonjoAdPolicy", targets: ["MonjoAdPolicy"])],
    targets: [
        .target(name: "MonjoAdPolicy"),
        .testTarget(name: "MonjoAdPolicyTests", dependencies: ["MonjoAdPolicy"])
    ]
)
