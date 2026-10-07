import Foundation

// Platform-independent decisions used by AdCoordinator and exercised with a
// fake clock in `swift test --package-path ios/AdPolicy`.
struct AdPolicy {
    enum Phase: String { case unknown, menu, playing, results }
    enum Consent: String { case idle, updating, required, loadingForm, presentingForm, allowed, blocked }
    enum SDK: String { case cold, starting, started }
    enum Load: String { case empty, loading, ready }
    enum Presentation: String { case idle, consent, privacyOptions, tracking, interstitial }

    private(set) var documentID: String?
    private(set) var revision = 0
    private(set) var phase = Phase.unknown
    private(set) var matchID: String?
    private(set) var seenRequests = Set<String>()
    private(set) var consumedMatches = Set<String>()
    var consent = Consent.idle
    var sdk = SDK.cold
    var load = Load.empty
    var presentation = Presentation.idle
    var canRequestAds = false
    var foreground = false
    var otherPresentation = false
    var loadedAt: TimeInterval?
    var lastPresentedAt: TimeInterval?

    var isBusy: Bool { presentation != .idle || consent == .loadingForm }
    var safeForConsentUI: Bool { phase == .menu && foreground && !otherPresentation && !isBusy }

    mutating func navigate() {
        documentID = nil
        revision += 1
        phase = .unknown
        matchID = nil
        seenRequests.removeAll()
        invalidateLoad()
        // A visible SDK sheet retains its lock across navigation/backgrounding.
    }

    mutating func bind(documentID: String) -> Bool {
        if let current = self.documentID { return current == documentID }
        self.documentID = documentID
        return true
    }

    mutating func accept(requestID: String) -> Bool {
        guard seenRequests.count < 4096, !seenRequests.contains(requestID) else { return false }
        seenRequests.insert(requestID)
        return true
    }

    mutating func context(phase: Phase, matchID: String?) {
        guard self.phase != phase || self.matchID != matchID else { return }
        revision += 1
        self.phase = phase
        self.matchID = matchID
    }

    mutating func invalidateLoad() { load = .empty; loadedAt = nil }

    mutating func reserveSDKStart(configurationVerified: Bool, trackingAuthorized: Bool,
                                  consentUpdated: Bool, unitConfigured: Bool) -> Bool {
        guard configurationVerified, trackingAuthorized, consentUpdated, unitConfigured,
              canRequestAds, consent == .allowed, presentation == .idle, sdk == .cold else { return false }
        sdk = .starting
        return true
    }

    mutating func expire(now: TimeInterval) {
        if let loadedAt, now - loadedAt >= 3500 || now < loadedAt { invalidateLoad() }
    }

    func reason(matchID: String?, placement: String?, now: TimeInterval) -> String? {
        guard foreground else { return "background" }
        guard !otherPresentation && !isBusy else { return "presentation-busy" }
        guard documentID != nil, phase == .results,
              let matchID, matchID == self.matchID,
              placement == "match-exit-home" else { return "unsafe-boundary" }
        guard !consumedMatches.contains(matchID), consumedMatches.count < 4096 else { return "match-consumed" }
        guard canRequestAds && consent == .allowed else { return "consent-unavailable" }
        guard sdk == .started && load == .ready,
              let loadedAt, now >= loadedAt, now - loadedAt < 3500 else { return "not-ready" }
        if let lastPresentedAt, now - lastPresentedAt < 180 { return "cooldown" }
        return nil
    }

    mutating func beginPresentation(matchID: String, placement: String, now: TimeInterval) -> String? {
        if let reason = reason(matchID: matchID, placement: placement, now: now) { return reason }
        consumedMatches.insert(matchID)
        lastPresentedAt = now
        presentation = .interstitial
        invalidateLoad() // A Google interstitial is single-use, including a failed presentation.
        return nil
    }
}
