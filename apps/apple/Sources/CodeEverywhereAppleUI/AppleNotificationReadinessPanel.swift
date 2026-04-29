import CodeEverywhereAppleCore
import SwiftUI

public struct AppleNotificationReadinessPanel: View {
    private let permissionProvider: any CockpitNotificationPermissionProviding

    @State private var state = AppleNotificationReadinessPanelState.checking

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
                Task { await requestPermission() }
            } label: {
                Label("Enable", systemImage: "bell.badge")
            }
            .disabled(!state.canRequestPermission)
        }
    }

    @MainActor
    private func refreshPermissionState() async {
        state = .checking
        state = .permission(await permissionProvider.currentPermissionState())
    }

    @MainActor
    private func requestPermission() async {
        state = .requesting
        do {
            state = .permission(try await permissionProvider.requestPermission())
        } catch {
            state = .failed
        }
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

    var canRequestPermission: Bool {
        switch self {
        case .permission(let permission):
            return permission.authorization == .notDetermined
        case .failed:
            return true
        case .checking, .requesting:
            return false
        }
    }
}
