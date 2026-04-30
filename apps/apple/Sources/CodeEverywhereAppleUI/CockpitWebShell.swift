import CodeEverywhereAppleCore
import SwiftUI
import WebKit

public struct CockpitWebShell: View {
    @Binding private var settings: CockpitConnectionSettings
    private let settingsStore: CockpitConnectionSettingsStore
    private let deepLinkRoute: CockpitDeepLinkRoute?

    public init(
        settings: Binding<CockpitConnectionSettings>,
        settingsStore: CockpitConnectionSettingsStore,
        deepLinkRoute: CockpitDeepLinkRoute? = nil
    ) {
        _settings = settings
        self.settingsStore = settingsStore
        self.deepLinkRoute = deepLinkRoute
    }

    public var body: some View {
        VStack(spacing: 0) {
            AppleConnectionSettingsPanel(settings: $settings, store: settingsStore)
            AppleDeviceTrustRegistrationPanel(settings: settings)
            AppleNotificationReadinessPanel()
            ApplePendingWorkNotificationSyncTask(settings: settings)
            Divider()
            CockpitWebView(url: shellURL)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .layoutPriority(1)
        }
        .navigationTitle("Code Everywhere")
    }

    private var shellURL: URL {
        guard let deepLinkRoute else {
            return settings.cockpitURL
        }

        var components = URLComponents(url: settings.cockpitURL, resolvingAgainstBaseURL: false)
        components?.fragment = CockpitDeepLinkParser().webFragment(for: deepLinkRoute)
        return components?.url ?? settings.cockpitURL
    }
}

#if os(macOS)
public struct CockpitWebView: NSViewRepresentable {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func makeCoordinator() -> CockpitWebViewCoordinator {
        CockpitWebViewCoordinator()
    }

    public func makeNSView(context: Context) -> WKWebView {
        makeWebView(url: url, coordinator: context.coordinator)
    }

    public func updateNSView(_ webView: WKWebView, context: Context) {
        loadIfNeeded(webView, url: url, coordinator: context.coordinator)
    }
}
#elseif os(iOS)
public struct CockpitWebView: UIViewRepresentable {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func makeCoordinator() -> CockpitWebViewCoordinator {
        CockpitWebViewCoordinator()
    }

    public func makeUIView(context: Context) -> WKWebView {
        makeWebView(url: url, coordinator: context.coordinator)
    }

    public func updateUIView(_ webView: WKWebView, context: Context) {
        loadIfNeeded(webView, url: url, coordinator: context.coordinator)
    }
}
#endif

public final class CockpitWebViewCoordinator: NSObject, WKNavigationDelegate {
    fileprivate var requestedURL: URL?

    public func webView(_ webView: WKWebView, didFinish _: WKNavigation!) {
        guard let url = webView.url else {
            return
        }

        requestedURL = url
    }

    public func webView(_: WKWebView, didFail _: WKNavigation!, withError _: Error) {
        requestedURL = nil
    }

    public func webView(_: WKWebView, didFailProvisionalNavigation _: WKNavigation!, withError _: Error) {
        requestedURL = nil
    }
}

@MainActor
private func makeWebView(url: URL, coordinator: CockpitWebViewCoordinator) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = coordinator
    return webView
}

@MainActor
private func loadIfNeeded(_ webView: WKWebView, url: URL, coordinator: CockpitWebViewCoordinator) {
    guard webView.url != url && coordinator.requestedURL != url else {
        return
    }

    coordinator.requestedURL = url
    webView.load(URLRequest(url: url))
}
