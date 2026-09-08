import AuthenticationServices
import CryptoKit
import Security
import UIKit
import WebKit

final class NativeBridge: NSObject, WKScriptMessageHandler, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    static let handlerName = "meonjeoNative"
    static let allowedHost = "meonjeo.syamo.chatgpt.site"
    static let bootstrapScript = #"""
    (() => {
      const send = payload => window.webkit.messageHandlers.meonjeoNative.postMessage(payload);
      window.meonjeoNative = Object.freeze({
        platform: 'ios',
        signInWithApple: () => send({ action: 'signInWithApple' }),
        haptic: (style = 'light') => send({ action: 'haptic', style }),
        share: (payload = {}) => send({ action: 'share', payload })
      });
    })();
    """#

    weak var webView: WKWebView?
    private var currentNonce: String?
    private var authorizationController: ASAuthorizationController?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.handlerName,
              message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host.lowercased() == Self.allowedHost,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "signInWithApple":
            startAppleSignIn()
        case "haptic":
            performHaptic(style: body["style"] as? String ?? "light")
        case "share":
            presentShareSheet(payload: body["payload"] as? [String: Any] ?? [:])
        default:
            break
        }
    }

    private func startAppleSignIn() {
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
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
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
                "idToken": idToken,
                "rawNonce": nonce,
                "authorizationCode": authorizationCode,
                "fullName": fullName,
                "email": credential.email ?? ""
            ]
        )
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
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
        authorizationController = nil
    }

    private func sendAppleFailure(code: String, message: String) {
        sendJavaScriptCallback(
            function: "window.meonjeoAuth?.failNativeAppleSignIn",
            payload: ["code": code, "message": message]
        )
    }

    private func sendJavaScriptCallback(function: String, payload: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("\(function)(\(json));")
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
            guard let root = self?.webView?.window?.rootViewController else { return }
            var presenter = root
            while let presented = presenter.presentedViewController { presenter = presented }
            let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
            controller.popoverPresentationController?.sourceView = self?.webView
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
