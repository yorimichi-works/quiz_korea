import Network
import SwiftUI

@MainActor
final class NetworkStatus: ObservableObject {
    @Published private(set) var isConnected = true

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.yorimichiworks.meonjeo.network")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isConnected = path.status == .satisfied
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}

struct ContentView: View {
    @StateObject private var network = NetworkStatus()
    @State private var isLoading = true

    var body: some View {
        ZStack(alignment: .top) {
            GameWebView(isLoading: $isLoading)
                .ignoresSafeArea(.container, edges: .bottom)

            if isLoading {
                ProgressView("퀴즈를 준비하고 있습니다…")
                    .padding(.horizontal, 20)
                    .padding(.vertical, 14)
                    .background(.regularMaterial, in: Capsule())
                    .foregroundStyle(.primary)
                    .accessibilityLabel("퀴즈 불러오는 중")
            }

            if !network.isConnected {
                Label("인터넷 연결을 확인해 주세요", systemImage: "wifi.slash")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color(uiColor: .label))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color(uiColor: .systemBackground), in: Capsule())
                    .shadow(color: .black.opacity(0.12), radius: 10, y: 3)
                    .padding(.top, 10)
                    .accessibilityAddTraits(.isStaticText)
            }
        }
        .background(Color(uiColor: .systemBackground))
    }
}
