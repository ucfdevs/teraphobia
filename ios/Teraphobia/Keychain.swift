import Foundation
import Security

// The signed-in session is one Keychain item. The Keychain survives an app restart and is encrypted, unlike UserDefaults.
enum Keychain {
    private static var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.teraphobia",
            kSecAttrAccount as String: "session",
        ]
    }

    static func save(_ data: Data) {
        // Delete then add is simpler than looking up whether to add or update.
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        // Readable once the phone is unlocked after a restart, and never copied to another device.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }

    static func load() -> Data? {
        var search = query
        search[kSecReturnData as String] = true
        var result: AnyObject?
        guard SecItemCopyMatching(search as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
