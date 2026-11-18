import SwiftUI

// Shown when the login or password is wrong. Generic on purpose: it never says which one.
struct LoginFailedView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ContentUnavailableView {
            Label("Login failed", systemImage: "xmark.octagon")
        } description: {
            Text("Check your username or email and password, then try again.")
        } actions: {
            Button("Try again") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
        .navigationBarBackButtonHidden()
    }
}

#Preview {
    NavigationStack {
        LoginFailedView()
    }
}
