import SwiftUI

// Shown when the login or password is wrong. Generic on purpose: it never says which one.
struct LoginFailedView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                StrangerView(size: 120)
                    .padding(.top, 24)

                Text("Login failed")
                    .font(.display(.largeTitle))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)

                Text("The door stays shut for now.")
                    .font(.headline)
                    .foregroundStyle(Theme.mutedText)
                    .multilineTextAlignment(.center)

                Text("Check your username or email and password, then try again.")
                    .font(.body)
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Try again") { dismiss() }
                    .buttonStyle(.candle)
                    .padding(.top, 8)
            }
            .frame(maxWidth: .infinity)
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .gameBackground(.plain)
        .toolbarBackground(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden()
    }
}

#Preview {
    NavigationStack {
        LoginFailedView()
    }
    .preferredColorScheme(.dark)
}
