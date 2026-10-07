import AppTrackingTransparency
import CoreFoundation
import Foundation
import GoogleMobileAds
import UIKit
import UserMessagingPlatform

@MainActor
protocol AdCoordinatorDelegate: AnyObject {
    func adPresenter() -> UIViewController?
    var hasExternalPresentation: Bool { get }
    func deliverAdResult(_ result: [String: Any], documentID: String)
}

/// All SDK calls and bridge decisions are serialized on the main actor.
/// Nothing here receives account identifiers, scores, tokens or question data.
@MainActor
final class AdCoordinator: NSObject, FullScreenContentDelegate {
    static let shared = AdCoordinator()
    weak var delegate: AdCoordinatorDelegate?

    private var policy = AdPolicy()
    private var generation = -1
    private var launchUpdateStarted = false
    private var launchUpdateFinished = false
    private var consentUpdateFailed = false
    private var awaitingATTForeground = false
    private var interstitial: InterstitialAd?
    private var presentingAd: InterstitialAd?
    private var loadID: UUID?
    private var preparation: Pending?
    private var modalRequest: Pending?
    private var preparationTimeout: DispatchWorkItem?
    private var loadTimeout: DispatchWorkItem?
    private var foregroundObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?

    var blocksExternalPresentation: Bool { policy.isBusy || preparation != nil }

    private struct Pending {
        let id = UUID()
        let requestID: String
        let documentID: String
        let operation: String
        let generation: Int
        let revision: Int
    }

    private var now: TimeInterval { ProcessInfo.processInfo.systemUptime }
    private var configurationVerified: Bool {
        // Only set true after the app-scoped UMP console messages and privacy
        // disclosures have been reviewed. A missing or string value fails closed.
        guard let value = Bundle.main.object(forInfoDictionaryKey: "MonjoAdsConsentConfigurationVerified") as? NSNumber,
              CFGetTypeID(value) == CFBooleanGetTypeID() else { return false }
        return value.boolValue
    }
    private var trackingEnabled: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "MonjoAdsTrackingEnabled") as? String) == "YES"
    }
    private var trackingAuthorized: Bool {
        trackingEnabled && ATTrackingManager.trackingAuthorizationStatus == .authorized
    }
    private var adUnitID: String? {
        guard let id = Bundle.main.object(forInfoDictionaryKey: "MonjoInterstitialAdUnitID") as? String,
              id.range(of: #"^ca-app-pub-[0-9]{16}/[0-9]{10}$"#, options: .regularExpression) != nil else { return nil }
        return id
    }

    private override init() {
        super.init()
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.refreshEnvironment()
                self.refreshConsent()
                if self.awaitingATTForeground, let pending = self.preparation {
                    self.resumeAfterTrackingAuthorization(pending)
                }
            }
        }
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.policy.foreground = false
                // Cancel only work that has not presented UI. Never unlock a visible sheet.
                self?.cancelUnpresentedPreparation(reason: "background")
            }
        }
    }

    func beginLaunch() {
        guard configurationVerified, trackingAuthorized else { policy.consent = .blocked; return }
        guard !launchUpdateStarted || (consentUpdateFailed && preparation != nil && policy.phase == .menu) else { return }
        launchUpdateStarted = true
        launchUpdateFinished = false
        consentUpdateFailed = false
        policy.consent = .updating
        // No reset, geography override, consent bypass, or test-device setting in Release.
        let parameters = RequestParameters()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-MonjoUMPDebugEEA") {
            let debug = DebugSettings()
            debug.geography = .EEA
            parameters.debugSettings = debug
        }
        if ProcessInfo.processInfo.arguments.contains("-MonjoUMPResetConsent") {
            ConsentInformation.shared.reset()
        }
        #endif
        ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { [weak self] error in
            Task { @MainActor in
                guard let self else { return }
                self.launchUpdateFinished = true
                self.consentUpdateFailed = error != nil
                self.refreshConsent()
                if let pending = self.preparation { self.continuePreparation(pending) }
            }
        }
    }

    func documentDidNavigate() {
        cancelUnpresentedPreparation(reason: "document-changed")
        policy.navigate()
        generation = -1
        invalidateAd()
        // modalRequest/presentingAd deliberately survive until SDK dismissal.
    }

    func handle(requestID: String, documentID: String, operation: String, payload: [String: Any]) {
        guard policy.bind(documentID: documentID),
              let requestedGeneration = Self.integer(payload["generation"]),
              requestedGeneration >= 0, requestedGeneration <= 1_000_000_000 else { return }
        let pending = Pending(requestID: requestID, documentID: documentID, operation: operation,
                              generation: requestedGeneration, revision: policy.revision)
        guard ["status", "context", "eligibility"].contains(operation) || policy.accept(requestID: requestID) else {
            // Duplicate messages cannot create a second terminal result or presentation.
            return
        }
        refreshEnvironment()
        refreshConsent()
        if operation == "context" {
            guard requestedGeneration >= generation,
                  let phaseText = payload["phase"] as? String,
                  let phase = AdPolicy.Phase(rawValue: phaseText), phase != .unknown else {
                reply(pending, ok: false, reason: "invalid-context"); return
            }
            let matchID = Self.identifier(payload["matchId"], maximum: 128)
            guard phase != .results || matchID != nil else {
                reply(pending, ok: false, reason: "invalid-context"); return
            }
            if requestedGeneration != generation || phase != policy.phase || matchID != policy.matchID {
                cancelUnpresentedPreparation(reason: "context-changed")
                invalidateAd()
            }
            generation = requestedGeneration
            policy.context(phase: phase, matchID: matchID)
            reply(pending)
            // A completed result screen can warm one ad without consent UI.
            // Starting a match discarded the previous context's cached ad.
            if phase == .results { loadAd() }
            return
        }
        // A fresh document may query an old document's still-visible SDK sheet.
        if operation == "status" { reply(pending); return }
        guard configurationVerified else {
            reply(pending, ok: false, reason: "consent-config-unverified"); return
        }
        guard requestedGeneration == generation else {
            reply(pending, ok: false, reason: "stale-generation"); return
        }
        switch operation {
        case "prepare":
            guard payload["allowConsentUI"] as? Bool == true, policy.phase == .menu else {
                reply(pending, ok: false, reason: "unsafe-consent-boundary"); return
            }
            guard preparation == nil, !policy.isBusy else {
                reply(pending, ok: false, reason: "presentation-busy"); return
            }
            preparation = pending
            let timeout = DispatchWorkItem { [weak self] in
                self?.cancelUnpresentedPreparation(reason: "prepare-timeout")
            }
            preparationTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: timeout)
            beginAuthorizedPreparation(pending)
        case "eligibility":
            let reason = eligibilityReason(payload)
            reply(pending, reason: reason, eligible: reason == nil)
        case "present": present(pending, payload: payload)
        case "privacyOptions": presentPrivacyOptions(pending)
        default: reply(pending, ok: false, reason: "unsupported-operation")
        }
    }

    private func beginAuthorizedPreparation(_ pending: Pending) {
        refreshEnvironment()
        guard isCurrent(pending), policy.safeForConsentUI else {
            finishPreparation(pending, reason: "unsafe-consent-boundary"); return
        }
        guard trackingEnabled else {
            finishPreparation(pending, reason: "tracking-config-disabled"); return
        }
        switch ATTrackingManager.trackingAuthorizationStatus {
        case .authorized:
            beginLaunch()
            if launchUpdateFinished { continuePreparation(pending) }
        case .denied, .restricted:
            finishPreparation(pending, reason: "tracking-not-authorized")
        case .notDetermined:
            guard let usage = Bundle.main.object(forInfoDictionaryKey: "NSUserTrackingUsageDescription") as? String,
                  !usage.isEmpty else {
                finishPreparation(pending, reason: "tracking-config-missing"); return
            }
            policy.presentation = .tracking
            preparationTimeout?.cancel()
            ATTrackingManager.requestTrackingAuthorization { [weak self] _ in
                Task { @MainActor in
                    guard let self else { return }
                    self.policy.presentation = .idle
                    self.refreshEnvironment()
                    guard self.isCurrent(pending), self.policy.phase == .menu,
                          self.trackingAuthorized else {
                        self.finishPreparation(pending, reason: "tracking-not-authorized"); return
                    }
                    // ATT completion may precede didBecomeActive. Keep the lock
                    // and resume from the foreground notification in that case.
                    self.awaitingATTForeground = true
                    self.resumeAfterTrackingAuthorization(pending)
                }
            }
        @unknown default:
            finishPreparation(pending, reason: "tracking-not-authorized")
        }
    }

    private func resumeAfterTrackingAuthorization(_ pending: Pending) {
        guard preparation?.id == pending.id, awaitingATTForeground else { return }
        guard isCurrent(pending), policy.phase == .menu, trackingAuthorized else {
            finishPreparation(pending, reason: "context-changed"); return
        }
        guard policy.foreground else { return }
        awaitingATTForeground = false
        let timeout = DispatchWorkItem { [weak self] in
            self?.cancelUnpresentedPreparation(reason: "prepare-timeout")
        }
        preparationTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 45, execute: timeout)
        beginLaunch()
        if launchUpdateFinished { continuePreparation(pending) }
    }

    private func continuePreparation(_ pending: Pending) {
        guard preparation?.id == pending.id else { return }
        refreshEnvironment()
        guard configurationVerified, trackingAuthorized, isCurrent(pending), policy.safeForConsentUI else {
            finishPreparation(pending, reason: "unsafe-consent-boundary"); return
        }
        refreshConsent()
        if ConsentInformation.shared.consentStatus == .required && !consentUpdateFailed {
            policy.consent = .loadingForm
            Task { @MainActor [weak self] in
                do {
                    guard self?.preparation?.id == pending.id, self?.trackingAuthorized == true,
                          self?.isCurrent(pending) == true else { return }
                    // Separate load/present allows rechecking foreground and context
                    // after a network delay. loadAndPresentIfRequired cannot do that.
                    let form = try await ConsentForm.load()
                    guard let self, self.preparation?.id == pending.id else { return }
                    self.policy.consent = .required
                    self.refreshEnvironment()
                    guard self.configurationVerified, self.trackingAuthorized,
                          self.isCurrent(pending), self.policy.safeForConsentUI,
                          let presenter = self.delegate?.adPresenter() else {
                        self.finishPreparation(pending, reason: "unsafe-consent-boundary"); return
                    }
                    self.policy.presentation = .consent
                    self.policy.consent = .presentingForm
                    // A displayed form has no artificial dismissal timeout.
                    self.preparationTimeout?.cancel()
                    try await form.present(from: presenter)
                    self.policy.presentation = .idle
                    self.refreshConsent()
                    self.finishConsentAndLoad(pending)
                } catch {
                    guard let self, self.preparation?.id == pending.id else { return }
                    self.policy.presentation = .idle
                    self.refreshConsent()
                    // UMP may allow requests using valid prior-session consent.
                    self.finishConsentAndLoad(pending, fallbackReason: "consent-error")
                }
            }
        } else {
            finishConsentAndLoad(pending, fallbackReason: consentUpdateFailed ? "consent-error" : "consent-unavailable")
        }
    }

    private func finishConsentAndLoad(_ pending: Pending, fallbackReason: String = "consent-unavailable") {
        guard preparation?.id == pending.id else { return }
        refreshEnvironment()
        refreshConsent()
        guard isCurrent(pending), policy.phase == .menu, policy.foreground else {
            finishPreparation(pending, reason: "context-changed"); return
        }
        guard policy.canRequestAds else { finishPreparation(pending, reason: fallbackReason); return }
        guard trackingAuthorized else {
            finishPreparation(pending, reason: "tracking-not-authorized"); return
        }
        startSDKAndLoad()
        finishPreparation(pending)
    }

    private func startSDKAndLoad() {
        refreshConsent()
        guard configurationVerified, trackingAuthorized, launchUpdateFinished, policy.canRequestAds, policy.presentation == .idle,
              adUnitID != nil else { return }
        if policy.sdk == .started { loadAd(); return }
        guard policy.reserveSDKStart(configurationVerified: configurationVerified,
                                     trackingAuthorized: trackingAuthorized,
                                     consentUpdated: launchUpdateFinished,
                                     unitConfigured: adUnitID != nil) else { return }
        let configuration = MobileAds.shared.requestConfiguration
        configuration.setPublisherFirstPartyIDEnabled(false)
        configuration.publisherPrivacyPersonalizationState = .disabled
        configuration.maxAdContentRating = .parentalGuidance
        // NPA/PPT reduces personalization; it is not a claim of zero collection
        // or sufficient evidence for an App Store "no tracking" declaration.
        MobileAds.shared.start { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.policy.sdk = .started
                self.loadAd()
            }
        }
    }

    private func loadAd() {
        refreshEnvironment()
        refreshConsent()
        guard configurationVerified, trackingAuthorized, policy.sdk == .started, policy.canRequestAds,
              policy.foreground, policy.documentID != nil, !policy.isBusy,
              policy.phase == .menu || policy.phase == .results,
              policy.load == .empty, let adUnitID else { return }
        let id = UUID()
        let documentID = policy.documentID
        let revision = policy.revision
        let contextGeneration = generation
        loadID = id
        policy.load = .loading
        let request = Request()
        let extras = Extras()
        extras.additionalParameters = ["npa": "1"]
        request.register(extras)
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.loadID == id else { return }
            self.invalidateAd()
        }
        loadTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 40, execute: timeout)
        Task { @MainActor [weak self] in
            do {
                guard self?.loadID == id, self?.policy.documentID == documentID,
                      self?.policy.revision == revision, self?.generation == contextGeneration,
                      self?.trackingAuthorized == true,
                      UIApplication.shared.applicationState == .active,
                      self?.policy.phase == .menu || self?.policy.phase == .results else { return }
                let ad = try await InterstitialAd.load(with: adUnitID, request: request)
                guard let self, self.loadID == id, self.policy.documentID == documentID,
                      self.policy.revision == revision, self.generation == contextGeneration else { return }
                self.refreshConsent()
                guard self.policy.canRequestAds else { self.invalidateAd(); return }
                self.loadTimeout?.cancel()
                self.loadID = nil
                self.interstitial = ad
                ad.fullScreenContentDelegate = self
                self.policy.load = .ready
                self.policy.loadedAt = self.now
            } catch {
                guard let self, self.loadID == id else { return }
                self.invalidateAd()
            }
        }
    }

    private func present(_ pending: Pending, payload: [String: Any]) {
        guard let expiresAt = payload["expiresAt"] as? Double,
              expiresAt > Date().timeIntervalSince1970 * 1000,
              expiresAt <= Date().timeIntervalSince1970 * 1000 + 5000 else {
            reply(pending, reason: "expired-request", event: "skipped"); return
        }
        if let reason = eligibilityReason(payload) {
            reply(pending, reason: reason, event: "skipped"); return
        }
        guard let ad = interstitial, let presenter = delegate?.adPresenter(),
              let matchID = Self.identifier(payload["matchId"], maximum: 128) else {
            reply(pending, reason: "not-ready", event: "skipped"); return
        }
        do { try ad.canPresent(from: presenter) }
        catch { invalidateAd(); reply(pending, reason: "cannot-present", event: "skipped"); return }
        if let reason = policy.beginPresentation(matchID: matchID, placement: "match-exit-home", now: now) {
            reply(pending, reason: reason, event: "skipped"); return
        }
        interstitial = nil
        presentingAd = ad // Retain until dismissal; preloaded instance is consumed.
        modalRequest = pending
        reply(pending, event: "presenting", terminal: false)
        ad.present(from: presenter)
    }

    private func presentPrivacyOptions(_ pending: Pending) {
        guard configurationVerified, trackingAuthorized, launchUpdateFinished,
              policy.safeForConsentUI, preparation == nil,
              ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
              let presenter = delegate?.adPresenter() else {
            reply(pending, ok: false, reason: "privacy-options-unavailable"); return
        }
        invalidateAd() // Never show an ad loaded under superseded choices.
        policy.presentation = .privacyOptions
        modalRequest = pending
        Task { @MainActor [weak self] in
            guard let self, self.modalRequest?.id == pending.id else { return }
            self.refreshEnvironment()
            guard self.configurationVerified, self.trackingAuthorized, self.launchUpdateFinished,
                  self.isCurrent(pending), self.policy.phase == .menu,
                  self.policy.foreground, !self.policy.otherPresentation,
                  presenter === self.delegate?.adPresenter() else {
                self.modalRequest = nil
                self.policy.presentation = .idle
                self.reply(pending, ok: false, reason: "context-changed")
                return
            }
            var failed = false
            do { try await ConsentForm.presentPrivacyOptionsForm(from: presenter) }
            catch { failed = true }
            guard self.modalRequest?.id == pending.id else { return }
            self.modalRequest = nil
            self.policy.presentation = .idle
            self.refreshConsent()
            self.reply(pending, ok: !failed, reason: failed ? "privacy-options-error" : nil)
            // Deliberately do not reload. A fresh prepare uses the new choices.
        }
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        finishAd(ad, failed: false)
    }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        finishAd(ad, failed: true)
    }

    private func finishAd(_ ad: FullScreenPresentingAd, failed: Bool) {
        guard let presentingAd, (ad as AnyObject) === presentingAd,
              let pending = modalRequest else { return }
        self.presentingAd = nil
        modalRequest = nil
        policy.presentation = .idle
        reply(pending, ok: !failed, reason: failed ? "presentation-failed" : nil,
              event: failed ? "failed" : "dismissed")
        // Web's next menu prepare may load a new ad, but never shows one here.
    }

    private func refreshEnvironment() {
        policy.foreground = UIApplication.shared.applicationState == .active
            && delegate?.adPresenter()?.view.window?.windowScene?.activationState == .foregroundActive
        policy.otherPresentation = delegate?.hasExternalPresentation ?? true
        policy.expire(now: now)
        if policy.load == .empty { interstitial = nil }
    }

    private func refreshConsent() {
        guard configurationVerified else {
            policy.canRequestAds = false
            policy.consent = .blocked
            invalidateAd()
            return
        }
        policy.canRequestAds = trackingAuthorized && launchUpdateFinished && ConsentInformation.shared.canRequestAds
        guard policy.consent != .loadingForm, policy.presentation != .consent else { return }
        if !trackingAuthorized { policy.consent = .blocked }
        else if !launchUpdateFinished { policy.consent = launchUpdateStarted ? .updating : .idle }
        else if policy.canRequestAds { policy.consent = .allowed }
        else if ConsentInformation.shared.consentStatus == .required { policy.consent = .required }
        else { policy.consent = .blocked }
        if !policy.canRequestAds { invalidateAd() }
    }

    private func eligibilityReason(_ payload: [String: Any]) -> String? {
        refreshEnvironment()
        refreshConsent()
        return policy.reason(matchID: Self.identifier(payload["matchId"], maximum: 128),
                             placement: payload["placement"] as? String, now: now)
    }

    private func invalidateAd() {
        loadID = nil
        loadTimeout?.cancel()
        loadTimeout = nil
        interstitial = nil
        policy.invalidateLoad()
    }

    private func isCurrent(_ pending: Pending) -> Bool {
        policy.documentID == pending.documentID && generation == pending.generation
            && policy.revision == pending.revision
    }

    private func cancelUnpresentedPreparation(reason: String) {
        guard policy.presentation == .idle, let pending = preparation else { return }
        finishPreparation(pending, reason: reason)
    }

    private func finishPreparation(_ pending: Pending, reason: String? = nil) {
        guard preparation?.id == pending.id else { return }
        preparation = nil
        awaitingATTForeground = false
        preparationTimeout?.cancel()
        preparationTimeout = nil
        if policy.consent == .loadingForm { policy.consent = .required }
        refreshConsent()
        reply(pending, ok: reason == nil, reason: reason)
    }

    private func reply(_ pending: Pending, ok: Bool = true, reason: String? = nil,
                       eligible: Bool = false, event: String = "complete", terminal: Bool = true) {
        let state: String
        if policy.presentation != .idle { state = policy.presentation.rawValue }
        else if policy.consent != .allowed { state = policy.consent.rawValue }
        else if policy.sdk != .started { state = policy.sdk.rawValue }
        else { state = policy.load.rawValue }
        delegate?.deliverAdResult([
            "requestId": pending.requestID, "documentId": pending.documentID,
            "operation": pending.operation, "generation": pending.generation,
            "ok": ok, "state": state, "event": event, "terminal": terminal,
            "reason": reason ?? "", "eligible": eligible,
            "busy": policy.isBusy || preparation != nil || policy.otherPresentation,
            "presentationActive": policy.presentation != .idle,
            "canRequestAds": policy.canRequestAds,
            "configurationVerified": configurationVerified,
            "privacyOptionsRequired": configurationVerified && trackingAuthorized && launchUpdateFinished
                && ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
            "phase": policy.phase.rawValue, "ready": policy.load == .ready,
            "trackingEnabled": trackingEnabled, "trackingAuthorized": trackingAuthorized
        ], documentID: pending.documentID)
    }

    private static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite,
              number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= 0, number.doubleValue <= 1_000_000_000 else { return nil }
        return number.intValue
    }

    private static func identifier(_ value: Any?, maximum: Int) -> String? {
        guard let text = value as? String, !text.isEmpty, text.utf8.count <= maximum,
              text.rangeOfCharacter(from: .controlCharacters) == nil else { return nil }
        return text
    }
}
