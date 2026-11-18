import SwiftUI
import GoogleSignIn

@main
struct TeraphobiaApp: App {
    // Only set when a UI test opens a game screen directly (UITestScreens.swift).
    @State private var testClient = RoomClient.forUITest()

    var body: some Scene {
        WindowGroup {
            Group {
                if let testClient {
                    NavigationStack { GameView(client: testClient) }
                        .tint(.orange)
                } else {
                    JoinView()
                }
            }
            .preferredColorScheme(.dark)
            // Google's sheet comes back to the app through the URL scheme in Info.plist.
            .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
        }
    }
}
