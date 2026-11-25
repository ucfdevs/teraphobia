import Foundation
import Security

// The signed-in session and the seat in a game are Keychain items. The Keychain survives an app restart and is encrypted, unlike UserDefaults.
enum Keychain {
    private static func query(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.teraphobia",
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ data: Data, account: String = "session") {
        // Delete then add is simpler than looking up whether to add or update.
        SecItemDelete(query(account) as CFDictionary)
        var item = query(account)
        item[kSecValueData as String] = data
        // Readable once the phone is unlocked after a restart, and never copied to another device.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static func load(account: String = "session") -> Data? {
        var search = query(account)
        search[kSecReturnData as String] = true
        var result: AnyObject?
        guard SecItemCopyMatching(search as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    static func delete(account: String = "session") {
        SecItemDelete(query(account) as CFDictionary)
    }
}
