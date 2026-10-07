import CoreFoundation
import Foundation

/// A compiled mode and the signed bundle must agree before any SDK is touched.
/// Test builds can never use a production ad unit, even after console verification.
struct AdBuildConfiguration {
    enum Mode: String {
        case production
        case adTesting = "ad-testing"
        case debug

        static var compiled: Mode {
            #if MONJO_AD_TESTING
            return .adTesting
            #elseif DEBUG
            return .debug
            #else
            return .production
            #endif
        }
    }

    static let appID = "ca-app-pub-3186852093801241~6780777097"
    static let productionUnitID = "ca-app-pub-3186852093801241/3315999799"
    static let testUnitID = "ca-app-pub-3940256099942544/4411468910"
    let info: [String: Any]
    let mode: Mode

    init(info: [String: Any], mode: Mode = .compiled) {
        self.info = info
        self.mode = mode
    }

    var testAdsOnly: Bool { mode != .production }
    var gateKey: String {
        testAdsOnly ? "MonjoAdsTestConsentConfigurationVerified" : "MonjoAdsConsentConfigurationVerified"
    }
    var identifiersValid: Bool {
        info["MonjoAdsBuildMode"] as? String == mode.rawValue
            && info["GADApplicationIdentifier"] as? String == Self.appID
            && info["MonjoAdsTrackingEnabled"] as? String == "YES"
            && info["MonjoInterstitialAdUnitID"] as? String == (testAdsOnly ? Self.testUnitID : Self.productionUnitID)
    }
    var configurationVerified: Bool {
        identifiersValid && boolean(gateKey) == true
            && (!testAdsOnly || boolean("MonjoAdsConsentConfigurationVerified") == false)
    }
    var adUnitID: String? {
        identifiersValid ? (testAdsOnly ? Self.testUnitID : Self.productionUnitID) : nil
    }

    private func boolean(_ key: String) -> Bool? {
        guard let value = info[key] as? NSNumber,
              CFGetTypeID(value) == CFBooleanGetTypeID() else { return nil }
        return value.boolValue
    }
}
