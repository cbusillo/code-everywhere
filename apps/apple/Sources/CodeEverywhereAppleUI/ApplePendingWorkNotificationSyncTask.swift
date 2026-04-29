import CodeEverywhereAppleCore
import SwiftUI

public struct ApplePendingWorkNotificationSyncTask: View {
    private let settings: CockpitConnectionSettings

    @Environment(\.scenePhase) private var scenePhase
    @State private var synchronizer: CockpitPendingWorkNotificationSynchronizer
    @State private var syncTask: Task<Void, Never>?

    public init(
        settings: CockpitConnectionSettings,
        synchronizer: CockpitPendingWorkNotificationSynchronizer = CockpitPendingWorkNotificationSynchronizer()
    ) {
        self.settings = settings
        _synchronizer = State(initialValue: synchronizer)
    }

    public var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .task {
                startSyncingIfNeeded()
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    startSyncingIfNeeded()
                } else if newPhase == .background {
                    stopSyncing()
                }
            }
            .onChange(of: settings) { _, _ in
                restartSyncing()
            }
            .onDisappear {
                stopSyncing()
            }
    }

    @MainActor
    private func startSyncingIfNeeded() {
        guard settings.brokerURL != nil else { return }
        guard syncTask == nil else { return }

        syncTask = Task {
            while !Task.isCancelled {
                try? await synchronizer.sync(settings: settings)
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    @MainActor
    private func stopSyncing() {
        syncTask?.cancel()
        syncTask = nil
    }

    @MainActor
    private func restartSyncing() {
        stopSyncing()

        syncTask = Task {
            await synchronizer.cancelAll()
            await MainActor.run {
                syncTask = nil
                startSyncingIfNeeded()
            }
        }
    }
}
