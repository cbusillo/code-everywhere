import CodeEverywhereAppleCore
import SwiftUI
import WebKit

public struct CockpitWebShell: View {
    private let settings: CockpitConnectionSettings
    private let deepLinkRoute: CockpitDeepLinkRoute?

    public init(settings: CockpitConnectionSettings, deepLinkRoute: CockpitDeepLinkRoute? = nil) {
        self.settings = settings
        self.deepLinkRoute = deepLinkRoute
    }

    public var body: some View {
        VStack(spacing: 0) {
            AppleDeviceTrustRegistrationPanel(settings: settings)
            AppleNotificationReadinessPanel()
            Divider()
            CockpitWebView(url: shellURL)
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

    public func makeNSView(context _: Context) -> WKWebView {
        makeWebView(url: url)
    }

    public func updateNSView(_ webView: WKWebView, context _: Context) {
        loadIfNeeded(webView, url: url)
    }
}
#elseif os(iOS)
public struct CockpitWebView: UIViewRepresentable {
    private let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func makeUIView(context _: Context) -> WKWebView {
        makeWebView(url: url)
    }

    public func updateUIView(_ webView: WKWebView, context _: Context) {
        loadIfNeeded(webView, url: url)
    }
}
#endif

@MainActor
private func makeWebView(url: URL) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.load(URLRequest(url: url))
    return webView
}

@MainActor
private func loadIfNeeded(_ webView: WKWebView, url: URL) {
    guard webView.url != url else {
        return
    }

    webView.load(URLRequest(url: url))
}
