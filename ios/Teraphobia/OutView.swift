import SwiftUI

// Shown to dead and banished players until the game ends. It has no buttons, so they can't act.
struct OutView: View {
    let lifeStatus: LifeStatus

    var body: some View {
        ContentUnavailableView {
            Label(lifeStatus == .banished ? "You were banished" : "You were killed", systemImage: "moon.zzz")
        } description: {
            Text("Stay quiet and watch the shared screen until the game ends.")
        }
        .navigationBarBackButtonHidden()
    }
}

#Preview {
    OutView(lifeStatus: .dead)
}
