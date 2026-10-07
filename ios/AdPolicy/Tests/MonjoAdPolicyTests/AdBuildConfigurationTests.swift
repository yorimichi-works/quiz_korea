import XCTest
@testable import MonjoAdPolicy

final class AdBuildConfigurationTests: XCTestCase {
    private func info(_ mode: AdBuildConfiguration.Mode) -> [String: Any] {
        [
            "GADApplicationIdentifier": AdBuildConfiguration.appID,
            "MonjoInterstitialAdUnitID": mode == .production ? AdBuildConfiguration.productionUnitID : AdBuildConfiguration.testUnitID,
            "MonjoAdsBuildMode": mode.rawValue,
            "MonjoAdsTrackingEnabled": "YES",
            "MonjoAdsConsentConfigurationVerified": false,
            "MonjoAdsTestConsentConfigurationVerified": false
        ]
    }

    func testEveryModeStartsWithAdvertisingBlocked() {
        for mode in [AdBuildConfiguration.Mode.production, .adTesting, .debug] {
            XCTAssertFalse(AdBuildConfiguration(info: info(mode), mode: mode).configurationVerified)
        }
    }

    func testOnlyTheTestGateEnablesAdTestingAndCannotEnableProduction() {
        var test = info(.adTesting)
        test["MonjoAdsTestConsentConfigurationVerified"] = true
        let config = AdBuildConfiguration(info: test, mode: .adTesting)
        XCTAssertTrue(config.configurationVerified)
        XCTAssertTrue(config.testAdsOnly)
        XCTAssertEqual(config.adUnitID, AdBuildConfiguration.testUnitID)
        var release = info(.production)
        release["MonjoAdsTestConsentConfigurationVerified"] = true
        XCTAssertFalse(AdBuildConfiguration(info: release, mode: .production).configurationVerified)
    }

    func testProductionGateCannotEnableAnyTestMode() {
        for mode in [AdBuildConfiguration.Mode.adTesting, .debug] {
            var values = info(mode)
            values["MonjoAdsConsentConfigurationVerified"] = true
            XCTAssertFalse(AdBuildConfiguration(info: values, mode: mode).configurationVerified)
            values["MonjoAdsTestConsentConfigurationVerified"] = true
            XCTAssertFalse(AdBuildConfiguration(info: values, mode: mode).configurationVerified)
        }
    }

    func testWrongModeUnitAppOrTrackingSettingFailsClosed() {
        for mode in [AdBuildConfiguration.Mode.production, .adTesting, .debug] {
            var values = info(mode)
            let key = mode == .production ? "MonjoAdsConsentConfigurationVerified" : "MonjoAdsTestConsentConfigurationVerified"
            values[key] = true
            for (field, invalid) in [
                ("MonjoAdsBuildMode", "unknown"),
                ("MonjoInterstitialAdUnitID", mode == .production ? AdBuildConfiguration.testUnitID : AdBuildConfiguration.productionUnitID),
                ("GADApplicationIdentifier", "ca-app-pub-3940256099942544~1458002511"),
                ("MonjoAdsTrackingEnabled", "NO")
            ] {
                var altered = values
                altered[field] = invalid
                let config = AdBuildConfiguration(info: altered, mode: mode)
                XCTAssertFalse(config.configurationVerified)
                XCTAssertNil(config.adUnitID)
            }
        }
    }

    func testMissingStringAndNumericGatesNeverEnableSDKs() {
        for mode in [AdBuildConfiguration.Mode.production, .adTesting, .debug] {
            let key = mode == .production ? "MonjoAdsConsentConfigurationVerified" : "MonjoAdsTestConsentConfigurationVerified"
            let invalidValues: [Any] = ["true", "YES", 1, 0, NSNull()]
            for invalid in invalidValues {
                var values = info(mode)
                values[key] = invalid
                XCTAssertFalse(AdBuildConfiguration(info: values, mode: mode).configurationVerified)
            }
            var missing = info(mode)
            missing.removeValue(forKey: key)
            XCTAssertFalse(AdBuildConfiguration(info: missing, mode: mode).configurationVerified)
        }
    }

    func testProductionRequiresItsOwnGateAndExactUnit() {
        var values = info(.production)
        values["MonjoAdsConsentConfigurationVerified"] = true
        let config = AdBuildConfiguration(info: values, mode: .production)
        XCTAssertTrue(config.configurationVerified)
        XCTAssertFalse(config.testAdsOnly)
        XCTAssertEqual(config.gateKey, "MonjoAdsConsentConfigurationVerified")
        XCTAssertEqual(config.adUnitID, AdBuildConfiguration.productionUnitID)
    }

    func testCompiledModeIsExplicit() {
        #if MONJO_AD_TESTING
        XCTAssertEqual(AdBuildConfiguration.Mode.compiled, .adTesting)
        #elseif DEBUG
        XCTAssertEqual(AdBuildConfiguration.Mode.compiled, .debug)
        #else
        XCTAssertEqual(AdBuildConfiguration.Mode.compiled, .production)
        #endif
    }
}
