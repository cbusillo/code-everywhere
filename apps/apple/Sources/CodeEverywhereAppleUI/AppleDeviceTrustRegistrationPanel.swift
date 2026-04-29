import CodeEverywhereAppleCore
import SwiftUI

public struct AppleDeviceTrustRegistrationPanel: View {
    private let settings: CockpitConnectionSettings
    private let identityStore: AppleDeviceIdentityStore
    private let client: AppleDeviceTrustClient

    @State private var state = AppleDeviceTrustRegistrationPanelState.idle

    public init(
        settings: CockpitConnectionSettings,
        identityStore: AppleDeviceIdentityStore = AppleDeviceIdentityStore(),
        client: AppleDeviceTrustClient = AppleDeviceTrustClient()
    ) {
        self.settings = settings
        self.identityStore = identityStore
        self.client = client
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
        .background(Color.secondary.opacity(0.08))
        .task {
            await refreshDeviceTrust()
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
                Task { await registerDevice() }
            } label: {
                Label("Register", systemImage: "checkmark.shield")
            }
            .disabled(!state.canSendCommand)

            Button(role: .destructive) {
                Task { await revokeDevice() }
            } label: {
                Label("Revoke", systemImage: "xmark.shield")
            }
            .disabled(!state.canSendCommand)
        }
    }

    @MainActor
    private func refreshDeviceTrust() async {
        guard settings.brokerURL != nil else {
            state = .missingBrokerURL
            return
        }

        state = .checking
        do {
            let identity = try identityStore.loadOrCreate()
            let snapshot = try await client.fetchRegistry(settings: settings)
            state = panelState(identity: identity, snapshot: snapshot)
        } catch {
            state = .failed(message(for: error))
        }
    }

    @MainActor
    private func registerDevice() async {
        state = .registering
        do {
            let identity = try identityStore.touch()
            let snapshot = try await client.registerDevice(identity: identity, settings: settings)
            state = panelState(identity: identity, snapshot: snapshot)
        } catch {
            state = .failed(message(for: error))
        }
    }

    @MainActor
    private func revokeDevice() async {
        state = .revoking
        do {
            let identity = try identityStore.loadOrCreate()
            let snapshot = try await client.revokeDevice(identity: identity, settings: settings)
            state = panelState(identity: identity, snapshot: snapshot)
        } catch {
            state = .failed(message(for: error))
        }
    }

    private func panelState(
        identity: AppleDeviceIdentity,
        snapshot: AppleLocalTrustRegistrySnapshot
    ) -> AppleDeviceTrustRegistrationPanelState {
        guard let device = snapshot.devices.first(where: { $0.deviceId == identity.deviceId }) else {
            return .unregistered(identity.displayName)
        }

        switch device.status {
        case .trusted:
            return .trusted(device.label)
        case .revoked:
            return .revoked(device.label)
        }
    }

    private func message(for error: Error) -> String {
        guard let clientError = error as? AppleDeviceTrustClientError else {
            return "Device trust request failed"
        }

        switch clientError {
        case .missingBrokerURL:
            return "Broker URL is not configured"
        case .invalidHTTPResponse:
            return "Broker response was not HTTP"
        case let .requestFailed(statusCode):
            return "Broker rejected device trust with HTTP \(statusCode)"
        case .invalidResponseBody:
            return "Broker trust response was invalid"
        }
    }
}

private enum AppleDeviceTrustRegistrationPanelState: Equatable {
    case idle
    case checking
    case unregistered(String)
    case trusted(String)
    case revoked(String)
    case registering
    case revoking
    case missingBrokerURL
    case failed(String)

    var title: String {
        switch self {
        case .idle, .checking:
            return "Checking device trust"
        case .unregistered:
            return "Device not registered"
        case .trusted:
            return "Device trusted"
        case .revoked:
            return "Device revoked"
        case .registering:
            return "Registering device"
        case .revoking:
            return "Revoking device"
        case .missingBrokerURL:
            return "Device trust unavailable"
        case .failed:
            return "Device trust failed"
        }
    }

    var detail: String {
        switch self {
        case .idle, .checking:
            return "Reading broker trust registry"
        case let .unregistered(label):
            return label
        case let .trusted(label):
            return label
        case let .revoked(label):
            return label
        case .registering:
            return "Sending local device identity"
        case .revoking:
            return "Updating broker trust registry"
        case .missingBrokerURL:
            return "No broker URL configured"
        case let .failed(message):
            return message
        }
    }

    var systemImage: String {
        switch self {
        case .idle, .checking, .registering, .revoking:
            return "arrow.triangle.2.circlepath"
        case .unregistered, .missingBrokerURL:
            return "questionmark.shield"
        case .trusted:
            return "checkmark.shield"
        case .revoked, .failed:
            return "exclamationmark.shield"
        }
    }

    var tint: Color {
        switch self {
        case .trusted:
            return .green
        case .revoked, .failed:
            return .red
        case .unregistered, .missingBrokerURL:
            return .orange
        case .idle, .checking, .registering, .revoking:
            return .secondary
        }
    }

    var isWorking: Bool {
        self == .checking || self == .registering || self == .revoking
    }

    var canSendCommand: Bool {
        !isWorking && self != .missingBrokerURL
    }
}
