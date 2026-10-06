import SwiftUI
import UIKit
import WebKit

struct GameWebView: UIViewRepresentable {
    static let gameURL = URL(string: "https://meonjeo.syamo.chatgpt.site/game.html")!

    @Binding var isLoading: Bool
    @Binding var loadingError: String?
    let reloadRequest: Int

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoading: $isLoading, loadingError: $loadingError, reloadRequest: reloadRequest)
    }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator.bridge, name: NativeBridge.handlerName)
        contentController.addUserScript(
            WKUserScript(
                source: NativeBridge.bootstrapScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController = contentController
        configuration.applicationNameForUserAgent = "MeonjeoIOS/1.0"

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.alwaysBounceVertical = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground

        let refreshControl = UIRefreshControl()
        refreshControl.addTarget(context.coordinator, action: #selector(Coordinator.refresh), for: .valueChanged)
        webView.scrollView.refreshControl = refreshControl

        context.coordinator.webView = webView
        context.coordinator.bridge.webView = webView
        webView.load(URLRequest(url: Self.gameURL, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.lastReloadRequest != reloadRequest else { return }
        context.coordinator.lastReloadRequest = reloadRequest
        webView.load(URLRequest(url: Self.gameURL, cachePolicy: .reloadIgnoringLocalCacheData))
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: NativeBridge.handlerName)
        coordinator.bridge.webView = nil
        coordinator.webView = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        fileprivate weak var webView: WKWebView?
        fileprivate let bridge = NativeBridge()
        private var isLoading: Binding<Bool>
        private var loadingError: Binding<String?>
        fileprivate var lastReloadRequest: Int

        init(isLoading: Binding<Bool>, loadingError: Binding<String?>, reloadRequest: Int) {
            self.isLoading = isLoading
            self.loadingError = loadingError
            self.lastReloadRequest = reloadRequest
        }

        @objc func refresh() {
            webView?.reloadFromOrigin()
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            loadingError.wrappedValue = nil
            isLoading.wrappedValue = true
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoading.wrappedValue = false
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showLoadFailure(webView, error: error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showLoadFailure(webView, error: error)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            isLoading.wrappedValue = false
            webView.scrollView.refreshControl?.endRefreshing()
            loadingError.wrappedValue = "게임 화면을 다시 불러와 주세요."
        }

        private func showLoadFailure(_ webView: WKWebView, error: Error) {
            // Redirects and a newer navigation cancel older loads; do not cover
            // the new page with an error for an intentionally cancelled request.
            let navigationError = error as NSError
            guard !(navigationError.domain == NSURLErrorDomain && navigationError.code == NSURLErrorCancelled) else { return }
            loadingError.wrappedValue = "게임을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요."
            isLoading.wrappedValue = false
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard navigationAction.targetFrame?.isMainFrame != false,
                  let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            if Self.isAllowedMainFrameURL(url) {
                decisionHandler(.allow)
                return
            }

            if ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            guard navigationAction.targetFrame == nil,
                  let url = navigationAction.request.url else { return nil }
            if Self.isAllowedMainFrameURL(url) {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url)
            }
            return nil
        }

        private static func isAllowedMainFrameURL(_ url: URL) -> Bool {
            if url.scheme == "about" { return true }
            return url.scheme?.lowercased() == "https" && url.host?.lowercased() == NativeBridge.allowedHost
        }
    }
}
