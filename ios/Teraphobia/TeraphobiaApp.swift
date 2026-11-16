import SwiftUI
import GoogleSignIn

@main
struct TeraphobiaApp: App {
    var body: some Scene {
        WindowGroup {
            JoinView()
                .preferredColorScheme(.dark)
                // Google's sheet comes back to the app through the URL scheme in Info.plist.
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
        }
    }
}
