import SwiftUI
import GoogleSignIn

@main
struct TeraphobiaApp: App {
    // Only set when a UI test opens a game screen directly (UITestScreens.swift).
    @State private var testClient = RoomClient.forUITest()

    init() {
        // Navigation bar titles in Bricolage, like the headings, over a clear bar so the sky shows through.
        // Since iOS 13 the bar reads its appearance objects, not the old title attributes on the proxy.
        let look = UINavigationBarAppearance()
        look.configureWithTransparentBackground()
        look.titleTextAttributes = [.font: UIFont.display(size: 17), .foregroundColor: UIColor(Theme.text)]
        look.largeTitleTextAttributes = [.font: UIFont.display(size: 34), .foregroundColor: UIColor(Theme.text)]
        let bar = UINavigationBar.appearance()
        bar.standardAppearance = look
        bar.scrollEdgeAppearance = look
        bar.compactAppearance = look
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
