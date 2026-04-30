import CodeEverywhereAppleCore
import SwiftUI

public struct AppleConnectionSettingsPanel: View {
    @Binding private var settings: CockpitConnectionSettings
    private let store: CockpitConnectionSettingsStore

    @State private var draft: CockpitConnectionSettingsDraft
    @State private var isExpanded = false
    @State private var statusMessage = "Connection settings loaded."
    @State private var statusTone = AppleConnectionSettingsStatusTone.ready

    public init(settings: Binding<CockpitConnectionSettings>, store: CockpitConnectionSettingsStore) {
        _settings = settings
        self.store = store
        _draft = State(initialValue: CockpitConnectionSettingsDraft(settings: settings.wrappedValue))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    statusLabel
                    Spacer(minLength: 8)
                    toggleButton
                }

                VStack(alignment: .leading, spacing: 8) {
                    statusLabel
                    toggleButton
                }
            }

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Cockpit URL", text: $draft.cockpitURLText)
#if os(iOS)
                        .keyboardType(.URL)
#endif
                    TextField("Broker URL", text: $draft.brokerURLText)
#if os(iOS)
                        .keyboardType(.URL)
#endif
                    SecureField("Broker token", text: $draft.brokerAuthTokenText)
                    HStack(spacing: 8) {
                        Button {
                            saveDraft()
                        } label: {
                            Label("Save", systemImage: "checkmark.circle")
                        }

                        Button {
                            resetDraft()
                        } label: {
                            Label("Reset", systemImage: "arrow.counterclockwise")
                        }
                    }
                }
                .textFieldStyle(.roundedBorder)
            }
        }
        .buttonStyle(.bordered)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.secondary.opacity(0.08))
        .onChange(of: settings) { _, newSettings in
            draft = CockpitConnectionSettingsDraft(settings: newSettings)
        }
    }

    private var statusLabel: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text("Connection")
                    .font(.caption.weight(.semibold))
                Text(statusMessage)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } icon: {
            Image(systemName: statusTone.systemImage)
                .foregroundStyle(statusTone.tint)
        }
        .labelStyle(.titleAndIcon)
    }

    private var toggleButton: some View {
        Button {
            isExpanded.toggle()
        } label: {
            Label(isExpanded ? "Hide" : "Configure", systemImage: isExpanded ? "chevron.up" : "slider.horizontal.3")
        }
    }

    private func saveDraft() {
        do {
            let nextSettings = try draft.connectionSettings()
            try store.save(nextSettings)
            settings = nextSettings
            statusTone = .ready
            statusMessage = "Saved \(nextSettings.cockpitURL.absoluteString)"
        } catch {
            statusTone = .error
            statusMessage = message(for: error)
        }
    }

    private func resetDraft() {
        draft = CockpitConnectionSettingsDraft(settings: settings)
        statusTone = .ready
        statusMessage = "Connection settings restored."
    }

    private func message(for error: Error) -> String {
        guard let draftError = error as? CockpitConnectionSettingsDraftError else {
            return "Unable to save connection settings."
        }

        switch draftError {
        case .invalidCockpitURL:
            return "Enter a valid HTTP cockpit URL."
        case .invalidBrokerURL:
            return "Enter a valid HTTP broker URL or leave it blank."
        }
    }
}

private enum AppleConnectionSettingsStatusTone {
    case ready
    case error

    var systemImage: String {
        switch self {
        case .ready:
            return "network"
        case .error:
            return "exclamationmark.triangle"
        }
    }

    var tint: Color {
        switch self {
        case .ready:
            return .secondary
        case .error:
            return .orange
        }
    }
}
