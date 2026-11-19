import SwiftUI
import GoogleSignIn

@main
struct TeraphobiaApp: App {
    // Only set when a UI test opens a game screen directly (UITestScreens.swift).
    @State private var testClient = RoomClient.forUITest()

    init() {
        // Navigation bar titles in Bricolage, like the headings.
        let bar = UINavigationBar.appearance()
        bar.titleTextAttributes = [.font: UIFont.display(size: 17)]
        bar.largeTitleTextAttributes = [.font: UIFont.display(size: 34)]
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if let testClient {
                    NavigationStack { GameView(client: testClient) }
                } else {
                    JoinView()
                }
            }
            // Candle orange is the one color you tap.
            .tint(Theme.candle)
            .preferredColorScheme(.dark)
            // Google's sheet comes back to the app through the URL scheme in Info.plist.
            .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
        }
    }
}
