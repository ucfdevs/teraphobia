import SwiftUI

// Shown to dead and banished players until the game ends. It has no game buttons, so they can't act.
struct OutView: View {
    let lifeStatus: LifeStatus

    private var banished: Bool { lifeStatus == .banished }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                GhostStranger(symbol: banished ? "figure.walk.departure" : "drop.fill")
                    .padding(.top, 24)

                VStack(spacing: 8) {
                    Text(banished ? "You were banished" : "You were killed")
                        .font(.display(.largeTitle))
                        .foregroundStyle(Theme.text)
                        .accessibilityAddTraits(.isHeader)
                    Text(banished ? "The village has spoken. Off you go into the dark."
                                  : "The Monster found you in the night.")
                        .font(.headline)
                        .foregroundStyle(Theme.text.opacity(0.85))
                }
                .multilineTextAlignment(.center)

                VStack(alignment: .leading, spacing: 12) {
                    Text("What now")
                        .font(.display(.title3))
                        .foregroundStyle(Theme.text)
                        .accessibilityAddTraits(.isHeader)
                    Text("You're out for the rest of the game. Stay quiet, don't give hints, and watch the shared screen until the game ends.")
                        .font(.body)
                        .foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .surface(.card, tint: Theme.blood.opacity(0.25))
            }
            .padding(.horizontal, Theme.gutter)
            .padding(.bottom, 32)
        }
        .gameBackground(.monsterWon)
        .navigationBarBackButtonHidden()
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                MuteButton()
            }
        }
    }
}

// The Stranger gone grey and see-through, floating over a blood glow, with a mark for how you went out.
// It floats gently, and holds still with Reduce Motion.
private struct GhostStranger: View {
    let symbol: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { context in
            let time = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            ZStack(alignment: .bottomTrailing) {
                StrangerView(size: 150)
                    .saturation(0)
                    .opacity(0.55)
                    .shadow(color: Theme.blood.opacity(0.9), radius: 24)
                    .offset(y: sin(time * 1.3) * 8)
                Image(systemName: symbol)
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Theme.blood)
                    .shadow(color: .black.opacity(0.6), radius: 4)
            }
            .frame(width: 170, height: 170)
        }
        .accessibilityHidden(true)
    }
}

#Preview("Killed") {
    NavigationStack { OutView(lifeStatus: .dead) }
}

#Preview("Banished") {
    NavigationStack { OutView(lifeStatus: .banished) }
}
