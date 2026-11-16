import SwiftUI

// A player's costume, drawn from the #78 sprites in Sprites.xcassets. Every sprite shares one
// 128x128 canvas, so stacking base, mask, hat, then item draws the whole figure.
struct CostumeView: View {
    let costume: Costume
    var size: CGFloat = 44

    var body: some View {
        SpriteStack(names: ["base", costume.mask.rawValue, costume.hat.rawValue, costume.item.rawValue], size: size)
            .accessibilityElement()
            .accessibilityLabel(costumeName(costume))
    }
}

// One clue trait on the plain base figure, for Search and Commune results.
struct TraitView: View {
    let trait: Trait
    var size: CGFloat = 64

    var body: some View {
        SpriteStack(names: ["base", trait.option.rawValue], size: size)
            .accessibilityHidden(true)
    }
}

private struct SpriteStack: View {
    let names: [String]
    let size: CGFloat

    var body: some View {
        ZStack {
            ForEach(names, id: \.self) { name in
                // Pixel art: no smoothing, so it stays sharp when scaled up.
                Image(name)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
            }
        }
        .frame(width: size, height: size)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
    }
}

// "top hat, domino mask, lantern". The ids read as words once the dashes go.
func costumeName(_ costume: Costume) -> String {
    [costume.hat.rawValue, costume.mask.rawValue, costume.item.rawValue]
        .map { $0.replacingOccurrences(of: "-", with: " ") }
        .joined(separator: ", ")
}

#Preview {
    HStack {
        CostumeView(costume: Costume(hat: .topHat, item: .lantern, mask: .dominoMask), size: 96)
        CostumeView(costume: Costume(hat: .crown, item: .raven, mask: .skullMask), size: 96)
        TraitView(trait: Trait(option: .jesterCap, slot: .hat), size: 96)
    }
}
