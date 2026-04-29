import CodeEverywhereAppleCore
import SwiftUI
#if os(iOS)
    import UIKit
#endif

public struct AppleNotificationReadinessPanel: View {
    private let permissionProvider: any CockpitNotificationPermissionProviding

    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    @State private var state = AppleNotificationReadinessPanelState.checking
    @State private var permissionRequestGeneration = 0

    public init(permissionProvider: any CockpitNotificationPermissionProviding = UserNotificationPermissionProvider()) {
        self.permissionProvider = permissionProvider
    }

    public var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                statusLabel
                Spacer(minLength: 8)
                actionControls
            }

            VStack(alignment: .leading, spacing: 8) {
                statusLabel
                actionControls
            }
        }
        .buttonStyle(.bordered)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.secondary.opacity(0.05))
        .task {
            await refreshPermissionState()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task { await refreshPermissionState() }
        }
    }

    private var statusLabel: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.title)
                    .font(.caption.weight(.semibold))
                Text(state.detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: state.systemImage)
                .foregroundStyle(state.tint)
        }
        .labelStyle(.titleAndIcon)
    }

    private var actionControls: some View {
        HStack(spacing: 8) {
            if state.isWorking {
                ProgressView()
                    .controlSize(.small)
            }
            Button {
                Task { await performPrimaryAction() }
            } label: {
                Label(state.actionTitle, systemImage: state.actionSystemImage)
            }
            .disabled(!state.canPerformPrimaryAction)
        }
    }

    @MainActor
    private func refreshPermissionState() async {
        let generation = permissionRequestGeneration
        state = .checking
        let permission = await permissionProvider.currentPermissionState()
        guard generation == permissionRequestGeneration else { return }
        state = .permission(permission)
    }

    @MainActor
    private func requestPermission() async {
        permissionRequestGeneration += 1
        state = .requesting
        do {
            state = .permission(try await permissionProvider.requestPermission())
        } catch {
            state = .failed
        }
    }

    @MainActor
    private func performPrimaryAction() async {
        if state.shouldOpenSettings {
            openNotificationSettings()
            return
        }

        await requestPermission()
    }

    private func openNotificationSettings() {
        guard let url = URL(string: Self.notificationSettingsURLString) else { return }
        openURL(url)
    }

    private static var notificationSettingsURLString: String {
        #if os(iOS)
            UIApplication.openSettingsURLString
        #elseif os(macOS)
            "x-apple.systempreferences:com.apple.preference.notifications"
        #else
            ""
        #endif
    }
}

private enum AppleNotificationReadinessPanelState: Equatable {
    case checking
    case requesting
    case permission(CockpitNotificationPermissionState)
    case failed

    var title: String {
        switch self {
        case .checking:
            return "Checking notifications"
        case .requesting:
            return "Requesting notifications"
        case let .permission(permission):
            return permission.canScheduleNotifications ? "Notifications ready" : "Notifications not enabled"
        case .failed:
            return "Notifications unavailable"
        }
    }

    var detail: String {
        switch self {
        case .checking:
            return "Reading local notification state"
        case .requesting:
            return "Waiting for system permission"
        case let .permission(permission):
            switch permission.authorization {
            case .notDetermined:
                return "Permission has not been requested"
            case .denied:
                return "Enable notifications in Settings"
            case .authorized:
                return "Local pending-work notifications can be scheduled"
            case .provisional:
                return "Quiet local notifications can be scheduled"
            case .ephemeral:
                return "Temporary notification permission is active"
            case .unknown:
                return "System notification state is unknown"
            }
        case .failed:
            return "Unable to read notification permission"
        }
    }

    var systemImage: String {
        switch self {
        case .checking, .requesting:
            return "arrow.triangle.2.circlepath"
        case let .permission(permission):
            return permission.canScheduleNotifications ? "bell.badge" : "bell.slash"
        case .failed:
            return "exclamationmark.triangle"
        }
    }

    var tint: Color {
        switch self {
        case .checking, .requesting:
            return .secondary
        case let .permission(permission):
            return permission.canScheduleNotifications ? .green : .orange
        case .failed:
            return .red
        }
    }

    var isWorking: Bool {
        self == .checking || self == .requesting
    }

    var canPerformPrimaryAction: Bool {
        switch self {
        case .permission(let permission):
            return permission.authorization == .notDetermined || permission.authorization == .denied
        case .failed:
            return true
        case .checking, .requesting:
            return false
        }
    }

    var shouldOpenSettings: Bool {
        guard case let .permission(permission) = self else { return false }
        return permission.authorization == .denied
    }

    var actionTitle: String {
        shouldOpenSettings ? "Settings" : "Enable"
    }

    var actionSystemImage: String {
        shouldOpenSettings ? "gearshape" : "bell.badge"
    }
}
