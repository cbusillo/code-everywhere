import CodeEverywhereAppleCore
import CodeEverywhereAppleUI
import SwiftUI

@main
struct CodeEverywhereApp: App {
    @State private var deepLinkRoute: CockpitDeepLinkRoute?

    private let deepLinkParser = CockpitDeepLinkParser()
    private let settings = CockpitConnectionSettings(
        cockpitURL: URL(string: "http://127.0.0.1:5173")!,
        brokerURL: URL(string: "http://127.0.0.1:3000")!
    )

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                CockpitWebShell(settings: settings, deepLinkRoute: deepLinkRoute)
                    .ignoresSafeArea(edges: .bottom)
            }
            .onOpenURL { url in
                deepLinkRoute = deepLinkParser.parse(url)
            }
        }
    }
}
