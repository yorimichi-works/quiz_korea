import XCTest
@testable import MonjoAdPolicy

final class AdPolicyTests: XCTestCase {
    private func ready(now: TimeInterval = 1000) -> AdPolicy {
        var policy = AdPolicy()
        XCTAssertTrue(policy.bind(documentID: "document-a"))
        policy.context(phase: .results, matchID: "match-a")
        policy.foreground = true
        policy.canRequestAds = true
        policy.consent = .allowed
        policy.sdk = .started
        policy.load = .ready
        policy.loadedAt = now
        return policy
    }

    private func reason(_ policy: AdPolicy, now: TimeInterval = 1000) -> String? {
        policy.reason(matchID: "match-a", placement: "match-exit-home", now: now)
    }

    func testReadyAdRequiresTheCompletedMatchBoundary() {
        var policy = ready()
        XCTAssertNil(reason(policy))
        policy.context(phase: .playing, matchID: "match-a")
        XCTAssertEqual(reason(policy), "unsafe-boundary")
        policy.context(phase: .menu, matchID: nil)
        XCTAssertEqual(reason(policy), "unsafe-boundary")
    }

    func testWrongMatchAndPlacementAreRejected() {
        let policy = ready()
        XCTAssertEqual(policy.reason(matchID: "other", placement: "match-exit-home", now: 1000), "unsafe-boundary")
        XCTAssertEqual(policy.reason(matchID: "match-a", placement: "reward", now: 1000), "unsafe-boundary")
    }

    func testNeverPresentBeforeConsentOrSDKReadiness() {
        var policy = ready()
        policy.canRequestAds = false
        XCTAssertEqual(reason(policy), "consent-unavailable")
        policy.canRequestAds = true
        policy.consent = .updating
        XCTAssertEqual(reason(policy), "consent-unavailable")
        policy.consent = .allowed
        policy.sdk = .starting
        XCTAssertEqual(reason(policy), "not-ready")
        policy.sdk = .started
        policy.load = .loading
        XCTAssertEqual(reason(policy), "not-ready")
    }

    func testBackgroundAndAuthOrShareBlockPresentation() {
        var policy = ready()
        policy.foreground = false
        XCTAssertEqual(reason(policy), "background")
        policy.foreground = true
        policy.otherPresentation = true
        XCTAssertEqual(reason(policy), "presentation-busy")
    }

    func testAllNativeSheetsKeepThePresentationLock() {
        for sheet in [AdPolicy.Presentation.consent, .privacyOptions, .tracking, .interstitial] {
            var policy = ready()
            policy.presentation = sheet
            XCTAssertTrue(policy.isBusy)
            XCTAssertEqual(reason(policy), "presentation-busy")
            policy.navigate()
            policy.foreground = false
            XCTAssertEqual(policy.presentation, sheet, "Reload/background must not unlock a visible native sheet")
        }
    }

    func testConsentUIRequiresForegroundMenuAndNoOtherPresentation() {
        var policy = ready()
        XCTAssertFalse(policy.safeForConsentUI)
        policy.context(phase: .menu, matchID: nil)
        XCTAssertTrue(policy.safeForConsentUI)
        policy.consent = .loadingForm
        XCTAssertFalse(policy.safeForConsentUI)
        policy.consent = .required
        policy.foreground = false
        XCTAssertFalse(policy.safeForConsentUI)
        policy.foreground = true
        policy.otherPresentation = true
        XCTAssertFalse(policy.safeForConsentUI)
    }

    func testSingleUseAdAndMatchAreConsumedBeforePresentationCallback() {
        var policy = ready()
        XCTAssertNil(policy.beginPresentation(matchID: "match-a", placement: "match-exit-home", now: 1000))
        XCTAssertEqual(policy.load, .empty)
        XCTAssertNil(policy.loadedAt)
        XCTAssertEqual(policy.presentation, .interstitial)
        XCTAssertEqual(reason(policy), "presentation-busy")
        policy.presentation = .idle // Fake SDK dismiss/failure.
        policy.load = .ready
        policy.loadedAt = 1200
        XCTAssertEqual(reason(policy, now: 1200), "match-consumed")
    }

    func testCooldownSurvivesNavigationAndNewMatch() {
        var policy = ready()
        XCTAssertNil(policy.beginPresentation(matchID: "match-a", placement: "match-exit-home", now: 1000))
        policy.presentation = .idle
        policy.navigate()
        XCTAssertTrue(policy.bind(documentID: "document-b"))
        policy.context(phase: .results, matchID: "match-b")
        policy.load = .ready
        policy.loadedAt = 1001
        XCTAssertEqual(policy.reason(matchID: "match-b", placement: "match-exit-home", now: 1179), "cooldown")
        XCTAssertNil(policy.reason(matchID: "match-b", placement: "match-exit-home", now: 1180))
    }

    func testExpiredAndClockReversedAdsAreDiscarded() {
        var policy = ready()
        XCTAssertEqual(reason(policy, now: 4500), "not-ready")
        policy.expire(now: 4500)
        XCTAssertEqual(policy.load, .empty)
        policy = ready()
        policy.expire(now: 999)
        XCTAssertEqual(policy.load, .empty)
    }

    func testDuplicateRequestsCannotExecuteTwiceAndLedgerIsBounded() {
        var policy = ready()
        XCTAssertTrue(policy.accept(requestID: "same"))
        XCTAssertFalse(policy.accept(requestID: "same"))
        for index in 0..<4095 { XCTAssertTrue(policy.accept(requestID: "id-\(index)")) }
        XCTAssertFalse(policy.accept(requestID: "overflow"))
        XCTAssertEqual(policy.seenRequests.count, 4096)
    }

    func testNavigationInvalidatesOldDocumentLoadAndRequests() {
        var policy = ready()
        XCTAssertTrue(policy.accept(requestID: "old"))
        XCTAssertFalse(policy.bind(documentID: "other"))
        let revision = policy.revision
        policy.navigate()
        XCTAssertGreaterThan(policy.revision, revision)
        XCTAssertNil(policy.documentID)
        XCTAssertEqual(policy.phase, .unknown)
        XCTAssertEqual(policy.load, .empty)
        XCTAssertTrue(policy.bind(documentID: "new"))
        XCTAssertTrue(policy.accept(requestID: "old"))
    }

    func testContextRevisionOnlyAdvancesWhenContextChanges() {
        var policy = ready()
        let revision = policy.revision
        policy.context(phase: .results, matchID: "match-a")
        XCTAssertEqual(policy.revision, revision)
        policy.context(phase: .menu, matchID: nil)
        XCTAssertGreaterThan(policy.revision, revision)
    }

    func testMockSDKStartsOnceOnlyAfterConfigurationATTAndUMP() {
        var policy = ready()
        policy.sdk = .cold
        var sdkStartCalls = 0
        func attempt(_ configured: Bool, _ att: Bool, _ ump: Bool, _ unit: Bool) {
            if policy.reserveSDKStart(configurationVerified: configured, trackingAuthorized: att,
                                      consentUpdated: ump, unitConfigured: unit) { sdkStartCalls += 1 }
        }
        attempt(false, true, true, true)
        attempt(true, false, true, true) // Denied/restricted/not-determined all map to false.
        attempt(true, true, false, true)
        attempt(true, true, true, false)
        XCTAssertEqual(sdkStartCalls, 0)
        XCTAssertEqual(policy.sdk, .cold)
        attempt(true, true, true, true)
        attempt(true, true, true, true) // Duplicate consent completion.
        XCTAssertEqual(sdkStartCalls, 1)
        XCTAssertEqual(policy.sdk, .starting)
        policy.sdk = .started
        attempt(true, true, true, true)
        XCTAssertEqual(sdkStartCalls, 1)
    }

    func testMockSDKCannotStartDuringConsentUIOrAfterConsentWithdrawal() {
        var policy = ready()
        policy.sdk = .cold
        policy.presentation = .consent
        XCTAssertFalse(policy.reserveSDKStart(configurationVerified: true, trackingAuthorized: true,
                                              consentUpdated: true, unitConfigured: true))
        policy.presentation = .idle
        policy.canRequestAds = false
        XCTAssertFalse(policy.reserveSDKStart(configurationVerified: true, trackingAuthorized: true,
                                              consentUpdated: true, unitConfigured: true))
        XCTAssertEqual(policy.sdk, .cold)
    }
}
