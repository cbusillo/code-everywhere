import Foundation
import Security

public protocol SecretStore: Sendable {
    func readSecret(account: String) throws -> String?
    func saveSecret(_ secret: String, account: String) throws
    func deleteSecret(account: String) throws
}

public enum SecretStoreError: Error, Equatable {
    case unexpectedData
    case keychainStatus(OSStatus)
}

public final class KeychainSecretStore: SecretStore, @unchecked Sendable {
    private let service: String

    public init(service: String = "CodeEverywhere") {
        self.service = service
    }

    public func readSecret(account: String) throws -> String? {
        var query = baseQuery(account: account)
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        query[kSecReturnData as String] = true

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw SecretStoreError.keychainStatus(status)
        }
        guard let data = item as? Data, let secret = String(data: data, encoding: .utf8) else {
            throw SecretStoreError.unexpectedData
        }
        return secret
    }

    public func saveSecret(_ secret: String, account: String) throws {
        let updateStatus = SecItemUpdate(
            baseQuery(account: account) as CFDictionary,
            [kSecValueData as String: Data(secret.utf8)] as CFDictionary,
        )
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            throw SecretStoreError.keychainStatus(updateStatus)
        }

        var query = baseQuery(account: account)
        query[kSecValueData as String] = Data(secret.utf8)

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SecretStoreError.keychainStatus(status)
        }
    }

    public func deleteSecret(account: String) throws {
        let status = SecItemDelete(baseQuery(account: account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw SecretStoreError.keychainStatus(status)
        }
    }

    private func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

public final class InMemorySecretStore: SecretStore, @unchecked Sendable {
    private var secrets: [String: String] = [:]
    private let lock = NSLock()

    public init() {}

    public func readSecret(account: String) -> String? {
        lock.withLock {
            secrets[account]
        }
    }

    public func saveSecret(_ secret: String, account: String) {
        lock.withLock {
            secrets[account] = secret
        }
    }

    public func deleteSecret(account: String) {
        lock.withLock {
            _ = secrets.removeValue(forKey: account)
        }
    }
}
