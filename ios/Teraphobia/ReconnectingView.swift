import SwiftUI

// Shown while the socket retries. RoomClient rejoins the same seat with the rejoin token by itself.
struct ReconnectingView: View {
    var body: some View {
        VStack(spacing: 12) {
            ProgressView("Reconnecting")
            Text("Hang on, you'll be back in your seat.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        .navigationBarBackButtonHidden()
    }
}

#Preview {
    ReconnectingView()
}
