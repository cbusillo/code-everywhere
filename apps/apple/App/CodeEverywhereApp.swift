import CodeEverywhereAppleCore
import CodeEverywhereAppleUI
import SwiftUI

@main
struct CodeEverywhereApp: App {
    private static let defaultSettings = CockpitConnectionSettings(
        cockpitURL: URL(string: "http://127.0.0.1:5173")!,
        brokerURL: URL(string: "http://127.0.0.1:3000")!
    )

    private let settingsStore: CockpitConnectionSettingsStore

    @State private var deepLinkRoute: CockpitDeepLinkRoute?
    @State private var settings: CockpitConnectionSettings

    private let deepLinkParser = CockpitDeepLinkParser()
    private let notificationRouter = CockpitNotificationRouter()

    init() {
        let store = CockpitConnectionSettingsStore(secrets: KeychainSecretStore())
        settingsStore = store
        _settings = State(initialValue: Self.initialSettings(store: store))
    }

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                CockpitWebShell(settings: $settings, settingsStore: settingsStore, deepLinkRoute: deepLinkRoute)
                    .ignoresSafeArea(edges: .bottom)
            }
            .onOpenURL { url in
                deepLinkRoute = notificationRouter.route(from: url)?.deepLinkRoute ?? deepLinkParser.parse(url)
            }
        }
    }

    private static func initialSettings(store: CockpitConnectionSettingsStore) -> CockpitConnectionSettings {
        (try? CockpitConnectionSettingsOverrides.settings(from: ProcessInfo.processInfo.arguments))
            ?? (try? store.load())
            ?? Self.defaultSettings
    }
}
