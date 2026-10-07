import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit
import WebKit

@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding, AdCoordinatorDelegate {
    static let handlerName = "meonjeoNative"
    static let allowedHost = "meonjeo.syamo.chatgpt.site"
    static let bootstrapScript = #"""
    (() => {
      const documentId = globalThis.crypto.randomUUID();
      const send = payload => window.webkit.messageHandlers.meonjeoNative.postMessage({ ...payload, documentId });
      window.meonjeoNative = Object.freeze({
        platform: 'ios',
        bridgeVersion: 4,
        documentId,
        ads: Object.freeze({
          version: 1,
          initialPresentationState: 'unknown',
          request: (requestId, operation, payload = {}) => send({ action: 'ads', requestId, operation, payload })
        }),
        signInWithApple: requestId => send({ action: 'signInWithApple', requestId }),
        revokeAppleToken: (requestId, firebaseIdToken, authorizationCode) =>
          send({ action: 'revokeAppleToken', requestId, firebaseIdToken, authorizationCode }),
        haptic: (style = 'light') => send({ action: 'haptic', style }),
        share: (payload = {}) => send({ action: 'share', payload })
      });
    })();
    """#

    weak var webView: WKWebView?
    private var currentNonce: String?
    private var currentRequestId: String?
    private var authorizationController: ASAuthorizationController?
    private var appleRevocation: PendingAppleRevocation?
    private var navigationGeneration = 0
    private var navigationInFlight = true
    private var hasCommittedDocument = false
    private var sharePresentationActive = false

    var bootstrapScriptForNavigation: String {
        // Only a fresh WKWebView can assert clean bootstrap synchronously.
        // Later documents stay conservative; their status handshake reconciles
        // any old sheet, including same-document and cancelled navigations.
        let busy = hasCommittedDocument || AdCoordinator.shared.blocksExternalPresentation || hasExternalPresentation
            || UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
                .flatMap { $0.windows }.contains { $0.rootViewController?.presentedViewController != nil }
        return Self.bootstrapScript.replacingOccurrences(
            of: "initialPresentationState: 'unknown'",
            with: "initialPresentationState: '\(busy ? "unknown" : "idle")'")
    }

    func prepareBootstrapForNavigation(in webView: WKWebView) {
        let controller = webView.configuration.userContentController
        let otherScripts = controller.userScripts.filter { !$0.source.contains("initialPresentationState:") }
        controller.removeAllUserScripts()
        otherScripts.forEach { controller.addUserScript($0) }
        controller.addUserScript(WKUserScript(source: bootstrapScriptForNavigation,
                                             injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    func activate() {
        AdCoordinator.shared.delegate = self
        AdCoordinator.shared.beginLaunch()
    }

    func documentDidNavigate() {
        navigationInFlight = true
        navigationGeneration += 1
        AdCoordinator.shared.documentDidNavigate()
    }

    func documentDidCommit() {
        // The old document remains live during a provisional load. Reset at the
        // commit boundary too so it cannot bind the new document's policy state.
        navigationGeneration += 1
        navigationInFlight = false
        hasCommittedDocument = true
        AdCoordinator.shared.documentDidNavigate()
    }

    func documentNavigationDidFail() {
        // Called only for the latest navigation. The previously committed page
        // may still be visible and must be able to reconcile a native sheet.
        navigationGeneration += 1
        navigationInFlight = false
        AdCoordinator.shared.documentDidNavigate()
    }

    var hasExternalPresentation: Bool {
        authorizationController != nil || sharePresentationActive
            || webView?.window?.rootViewController?.presentedViewController != nil
    }

    func adPresenter() -> UIViewController? {
        guard let root = webView?.window?.rootViewController,
              root.viewIfLoaded?.window != nil else { return nil }
        return root
    }

    func deliverAdResult(_ result: [String: Any], documentID: String) {
        sendJavaScriptCallback(function: "window.meonjeoAds?.receiveNativeResult",
                               payload: result, documentID: documentID)
    }

    // Public Firebase project configuration, never supplied by the web page.
    private static let revocationEndpoint = URL(string: "https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ")!
    private static let firebaseIOSAppID = "1:553966867727:ios:14c20adb13506901b8da7a"
    private static let expectedBundleID = "com.yorimichiworks.meonjeo"
    private static let revocationTimeout: TimeInterval = 35

    private struct PendingAppleRevocation {
        // A native operation ID prevents late completions from affecting a retry,
        // even if a caller reuses a JavaScript request ID.
        let operationID: UUID
        let requestID: String
        let documentID: String
        let session: URLSession
        let timeout: DispatchWorkItem
    }

    private enum AppleRevocationFailure {
        case invalidRequest, inProgress, unavailable, timedOut, failed

        var code: String {
            switch self {
            case .invalidRequest: return "auth/native-apple-revoke-invalid-request"
            case .inProgress: return "auth/native-apple-revoke-request-in-progress"
            case .unavailable: return "auth/native-apple-revoke-unavailable"
            case .timedOut: return "auth/native-apple-revoke-timeout"
            case .failed: return "auth/native-apple-revoke-failed"
            }
        }

        var message: String {
            switch self {
            case .invalidRequest: return "Apple 연결 해제 요청을 확인할 수 없습니다."
            case .inProgress: return "Apple 연결 해제 요청이 진행 중입니다."
            case .unavailable: return "Apple 연결 해제를 시작할 수 없습니다."
            case .timedOut: return "Apple 연결 해제 요청 시간이 초과되었습니다."
            case .failed: return "Apple 연결 해제에 실패했습니다. 다시 시도해 주세요."
            }
        }
    }

    deinit {
        appleRevocation?.timeout.cancel()
        appleRevocation?.session.invalidateAndCancel()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host.lowercased() == Self.allowedHost,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "ads":
            guard message.webView === webView,
                  [0, 443].contains(message.frameInfo.securityOrigin.port) else { return }
            receiveAdRequest(body)
        case "signInWithApple":
            startAppleSignIn(requestId: body["requestId"] as? String)
        case "revokeAppleToken":
            guard message.webView === webView,
                  [0, 443].contains(message.frameInfo.securityOrigin.port) else { return }
            startAppleRevocation(body: body)
        case "haptic":
            performHaptic(style: body["style"] as? String ?? "light")
        case "share":
            presentShareSheet(payload: body["payload"] as? [String: Any] ?? [:])
        default:
            break
        }
    }

    private func receiveAdRequest(_ body: [String: Any]) {
        guard !navigationInFlight,
              let requestID = Self.boundedBridgeString(body["requestId"], maximumBytes: 128),
              let documentID = Self.boundedBridgeString(body["documentId"], maximumBytes: 64),
              UUID(uuidString: documentID) != nil,
              let operation = Self.boundedBridgeString(body["operation"], maximumBytes: 32),
              let payload = body["payload"] as? [String: Any],
              JSONSerialization.isValidJSONObject(body),
              let serialized = try? JSONSerialization.data(withJSONObject: body),
              serialized.count <= 2048,
              let webView else { return }
        let expectedNavigation = navigationGeneration
        // Main-frame origin alone cannot distinguish two documents at the same
        // origin. Verify the currently executing bootstrap ID before accepting.
        webView.evaluateJavaScript("window.meonjeoNative?.documentId") { [weak self, weak webView] value, error in
            guard let self, let webView, self.webView === webView,
                  !self.navigationInFlight,
                  self.navigationGeneration == expectedNavigation,
                  error == nil, value as? String == documentID,
                  webView.url?.scheme?.lowercased() == "https",
                  webView.url?.host?.lowercased() == Self.allowedHost,
                  webView.url?.port == nil || webView.url?.port == 443 else { return }
            AdCoordinator.shared.handle(requestID: requestID, documentID: documentID,
                                        operation: operation, payload: payload)
        }
    }

    private static func boundedBridgeString(_ value: Any?, maximumBytes: Int) -> String? {
        guard let value = value as? String,
              !value.isEmpty, value.utf8.count <= maximumBytes,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              value.rangeOfCharacter(from: .controlCharacters) == nil else { return nil }
        return value
    }

    private func startAppleRevocation(body: [String: Any]) {
        // Uncorrelatable messages are ignored rather than reflected back to JS.
        guard let requestID = Self.boundedBridgeString(body["requestId"], maximumBytes: 128),
              let documentID = Self.boundedBridgeString(body["documentId"], maximumBytes: 64),
              UUID(uuidString: documentID) != nil else { return }

        guard appleRevocation == nil else {
            sendAppleRevocationFailure(.inProgress, requestID: requestID, documentID: documentID)
            return
        }
        guard let firebaseIDToken = Self.boundedBridgeString(body["firebaseIdToken"], maximumBytes: 16384),
              let authorizationCode = Self.boundedBridgeString(body["authorizationCode"], maximumBytes: 8192) else {
            sendAppleRevocationFailure(.invalidRequest, requestID: requestID, documentID: documentID)
            return
        }
        guard let bundleID = Bundle.main.bundleIdentifier,
              bundleID == Self.expectedBundleID else {
            sendAppleRevocationFailure(.unavailable, requestID: requestID, documentID: documentID)
            return
        }

        // Matches the Firebase Apple SDK's RevokeTokenRequest wire body.
        // This custom transport has not yet been validated against the live service.
        let body: [String: String] = [
            "providerId": "apple.com",
            "tokenType": "3",
            "token": authorizationCode,
            "idToken": firebaseIDToken
        ]
        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else {
            sendAppleRevocationFailure(.invalidRequest, requestID: requestID, documentID: documentID)
            return
        }
        var request = URLRequest(url: Self.revocationEndpoint,
                                 cachePolicy: .reloadIgnoringLocalCacheData,
                                 timeoutInterval: 30)
        request.httpMethod = "POST"
        request.httpBody = bodyData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue(bundleID, forHTTPHeaderField: "X-Ios-Bundle-Identifier")
        request.setValue(Self.firebaseIOSAppID, forHTTPHeaderField: "X-Firebase-GMPID")
        // Identify our own implementation honestly; this is not FirebaseSDK.
        request.setValue("iOS/MeonjeoNativeBridge/3", forHTTPHeaderField: "X-Client-Version")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = Self.revocationTimeout
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        let session = URLSession(configuration: configuration,
                                 delegate: AppleRevocationSessionDelegate(),
                                 delegateQueue: nil)
        let operationID = UUID()
        let timeout = DispatchWorkItem { [weak self] in
            self?.finishAppleRevocation(operationID: operationID, failure: .timedOut)
        }
        appleRevocation = PendingAppleRevocation(operationID: operationID,
                                                 requestID: requestID,
                                                 documentID: documentID,
                                                 session: session,
                                                 timeout: timeout)
        // Tokens are used only in the in-memory request; never log or persist them.
        let task = session.dataTask(with: request) { [weak self] _, response, error in
            DispatchQueue.main.async { [weak self] in
                let failure: AppleRevocationFailure?
                if let error = error as NSError? {
                    failure = error.domain == NSURLErrorDomain && error.code == NSURLErrorTimedOut
                        ? .timedOut : .failed
                } else if let response = response as? HTTPURLResponse,
                          response.url == Self.revocationEndpoint,
                          (200..<300).contains(response.statusCode) {
                    failure = nil
                } else {
                    failure = .failed
                }
                self?.finishAppleRevocation(operationID: operationID, failure: failure)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.revocationTimeout, execute: timeout)
        task.resume()
    }

    private func finishAppleRevocation(operationID: UUID, failure: AppleRevocationFailure?) {
        guard let pending = appleRevocation, pending.operationID == operationID else { return }
        appleRevocation = nil
        pending.timeout.cancel()
        pending.session.invalidateAndCancel()
        if let failure = failure {
            sendAppleRevocationFailure(failure, requestID: pending.requestID, documentID: pending.documentID)
        } else {
            sendJavaScriptCallback(function: "window.meonjeoAuth?.completeNativeAppleRevocation",
                                   payload: ["requestId": pending.requestID],
                                   documentID: pending.documentID)
        }
    }

    private func sendAppleRevocationFailure(_ failure: AppleRevocationFailure, requestID: String, documentID: String) {
        sendJavaScriptCallback(function: "window.meonjeoAuth?.failNativeAppleRevocation",
                               payload: ["requestId": requestID, "code": failure.code, "message": failure.message],
                               documentID: documentID)
    }

    private func startAppleSignIn(requestId: String?) {
        guard authorizationController == nil else {
            sendAppleFailure(code: "auth/native-apple-request-in-progress", message: "Apple 로그인 요청이 진행 중입니다.", requestId: requestId)
            return
        }
        guard !AdCoordinator.shared.blocksExternalPresentation, !hasExternalPresentation,
              UIApplication.shared.applicationState == .active else {
            sendAppleFailure(code: "auth/native-presentation-busy", message: "열려 있는 화면을 닫은 뒤 다시 시도해 주세요.", requestId: requestId)
            return
        }
        currentRequestId = requestId
        do {
            let nonce = try randomNonceString()
            currentNonce = nonce
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = sha256(nonce)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            authorizationController = controller
            controller.performRequests()
        } catch {
            sendAppleFailure(code: "auth/native-apple-unavailable", message: "Apple 로그인을 시작할 수 없습니다.")
            clearAuthorizationState()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard controller === authorizationController else { return }
        defer { clearAuthorizationState() }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let nonce = currentNonce,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8),
              let codeData = credential.authorizationCode,
              let authorizationCode = String(data: codeData, encoding: .utf8) else {
            sendAppleFailure(code: "auth/native-apple-invalid-credential", message: "Apple 인증 정보를 확인할 수 없습니다.")
            return
        }

        let nameFormatter = PersonNameComponentsFormatter()
        let fullName = credential.fullName.map { nameFormatter.string(from: $0) } ?? ""
        sendJavaScriptCallback(
            function: "window.meonjeoAuth?.completeNativeAppleSignIn",
            payload: [
                "requestId": currentRequestId ?? "",
                "idToken": idToken,
                "rawNonce": nonce,
                "authorizationCode": authorizationCode,
                "fullName": fullName,
                "email": credential.email ?? ""
            ]
        )
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard controller === authorizationController else { return }
        defer { clearAuthorizationState() }
        let authorizationError = error as? ASAuthorizationError
        let cancelled = authorizationError?.code == .canceled
        sendAppleFailure(
            code: cancelled ? "auth/native-apple-cancelled" : "auth/native-apple-failed",
            message: cancelled ? "Apple 로그인을 취소했습니다." : "Apple 로그인에 실패했습니다."
        )
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        webView?.window ?? ASPresentationAnchor()
    }

    private func clearAuthorizationState() {
        currentNonce = nil
        currentRequestId = nil
        authorizationController = nil
    }

    private func sendAppleFailure(code: String, message: String, requestId: String? = nil) {
        sendJavaScriptCallback(
            function: "window.meonjeoAuth?.failNativeAppleSignIn",
            payload: ["code": code, "message": message, "requestId": requestId ?? currentRequestId ?? ""]
        )
    }

    private func sendJavaScriptCallback(function: String, payload: [String: Any], documentID: String? = nil) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let script: String
        if let documentID = documentID {
            guard let documentData = try? JSONSerialization.data(withJSONObject: [documentID]),
                  let documentJSON = String(data: documentData, encoding: .utf8) else { return }
            // A reload or same-origin navigation gets a new document ID. Never
            // deliver an older operation's callback into that new document.
            script = "if (window.meonjeoNative?.documentId === \(documentJSON)[0]) { \(function)(\(json)); }"
        } else {
            script = "\(function)(\(json));"
        }
        DispatchQueue.main.async { [weak self] in
            guard let webView = self?.webView,
                  webView.url?.scheme?.lowercased() == "https",
                  webView.url?.host?.lowercased() == Self.allowedHost else { return }
            webView.evaluateJavaScript(script)
        }
    }

    private func performHaptic(style: String) {
        DispatchQueue.main.async {
            switch style {
            case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
            case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }

    private func presentShareSheet(payload: [String: Any]) {
        var items: [Any] = []
        if let text = payload["text"] as? String, !text.isEmpty { items.append(text) }
        if let value = payload["url"] as? String, let url = URL(string: value), url.scheme == "https" { items.append(url) }
        guard !items.isEmpty else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self, !AdCoordinator.shared.blocksExternalPresentation,
                  !self.hasExternalPresentation, UIApplication.shared.applicationState == .active,
                  let presenter = self.webView?.window?.rootViewController else { return }
            let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
            self.sharePresentationActive = true
            controller.completionWithItemsHandler = { [weak self] _, _, _, _ in
                self?.sharePresentationActive = false
            }
            controller.popoverPresentationController?.sourceView = self.webView
            presenter.present(controller, animated: true)
        }
    }

    private func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func randomNonceString(length: Int = 32) throws -> String {
        precondition(length > 0)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length

        while remainingLength > 0 {
            var random: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            guard status == errSecSuccess else {
                throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
            }
            if Int(random) < charset.count {
                result.append(charset[Int(random)])
                remainingLength -= 1
            }
        }
        return result
    }
}

private final class AppleRevocationSessionDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        // Never forward the one-time Apple code or Firebase token to a redirect.
        completionHandler(nil)
    }
}
