import SwiftUI

// A player as a card: their costume (or the Stranger when it isn't known yet) over their name.
// Selected cards get an orange border and a checkmark badge.
struct CostumeCard: View {
    let name: String
    let costume: Costume?
    var selected = false
    var spriteSize: CGFloat = 76

    var body: some View {
        VStack(spacing: 6) {
            Group {
                if let costume {
                    CostumeView(costume: costume, size: spriteSize, boxed: false)
                } else {
                    StrangerView(size: spriteSize)
                }
            }
            .accessibilityHidden(true)
            Text(name)
                .font(.headline)
                .foregroundStyle(Theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 6)
        .surface(.card, selected: selected, interactive: true)
        .overlay(alignment: .topTrailing) {
            if selected {
                Image(systemName: "checkmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(Theme.onCandle, Theme.candle)
                    .padding(6)
                    .transition(.scale.combined(with: .opacity))
                    // The Selected trait already says this.
                    .accessibilityHidden(true)
            }
        }
        .animation(.spring(duration: 0.25, bounce: 0.4), value: selected)
    }
}

// Players as a grid of costume cards you tap to pick. Each card is one button whose label starts with
// the name, so VoiceOver and the UI tests find it by name. Every pick creaks the same for every role.
struct CostumeGrid: View {
    let seats: [PublicSeat]
    let picked: [String]
    let onPick: (String) -> Void

    private let columns = [GridItem(.adaptive(minimum: 100, maximum: 160), spacing: 12)]

    var body: some View {
        // Not in a GlassGroup: its shared glass draws over the picked card's orange border and badge.
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(seats, id: \.seatID) { seat in
                let isPicked = picked.contains(seat.seatID)
                Button {
                    SoundEngine.shared.play(.pick)
                    onPick(seat.seatID)
                } label: {
                    CostumeCard(name: seat.displayName, costume: seat.costume, selected: isPicked)
                }
                .buttonStyle(CardPressStyle())
                .sensoryFeedback(.selection, trigger: isPicked)
                .accessibilityLabel(seat.costume.map { "\(seat.displayName), \(costumeName($0))" } ?? seat.displayName)
                .accessibilityAddTraits(isPicked ? .isSelected : [])
            }
        }
    }
}

// The Stranger saying something in a speech bubble: hints, empty states and flavor.
struct StrangerSays: View {
    let text: String
    var size: CGFloat = 64

    var body: some View {
        HStack(alignment: .bottom, spacing: 4) {
            StrangerView(size: size)
            Text(text)
                .font(.callout)
                .foregroundStyle(Theme.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .surface(.card)
                .overlay(alignment: .bottomLeading) {
                    // The bubble's tail, pointing at the Stranger.
                    BubbleTail()
                        .fill(Theme.border.opacity(0.8))
                        .frame(width: 10, height: 12)
                        .offset(x: -8, y: -12)
                }
                .padding(.bottom, size * 0.35)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

private struct BubbleTail: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

#Preview {
    ScrollView {
        VStack(spacing: 20) {
            StrangerSays(text: "Someone in this village isn't who they seem.")
            CostumeGrid(seats: PublicSeat.previews, picked: ["seat1"], onPick: { _ in })
        }
        .padding(Theme.gutter)
    }
    .gameBackground(.night)
}
