import SwiftUI
import UIKit

// The iOS look. The navy, text and candle values match shared/design-tokens.json. The blood, phase and
// Monster colors are iOS-only, so they live here and the web tokens stay as they are.
enum Theme {
    // Moonlit navy.
    static let night = Color(hex: 0x090D1A)
    static let nightRaised = Color(hex: 0x11162B)
    static let surface = Color(hex: 0x141B2E)
    static let border = Color(hex: 0x2A3554)
    static let text = Color(hex: 0xF8FAFC)
    static let mutedText = Color(hex: 0x94A3B8)

    // Candle orange is the only color you tap. Text on it is navy, since white on orange is too faint to read.
    static let candle = Color(hex: 0xF97316)
    static let candleEdge = Color(hex: 0xC2410C)
    static let onCandle = Color(hex: 0x090D1A)

    // Blood red is the brand and the color of death, the same red as the website's buttons and logo.
    static let blood = Color(hex: 0xA81818)
    // A brighter blood for a timer's last seconds: blood red is too dark to read as a thin ring on navy.
    static let urgent = Color(hex: 0xC81E2E)
    static let moon = Color(hex: 0xEDEBD6)
    static let gold = Color(hex: 0xF5C542)

    // Day: dusky purple over an ember horizon. Discussion and Vote: near-black lit by a candle.
    // Night: a deep blue sky that settles into the navy.
    static let nightTop = Color(hex: 0x121733)
    static let duskTop = Color(hex: 0x140B24)
    static let dusk = Color(hex: 0x2A1740)
    static let ember = Color(hex: 0xE2583E)
    static let candlelit = Color(hex: 0x07080D)

    // One color per Monster type, for the Monster look.
    static let vampire = Color(hex: 0xC81E2E)
    static let witch = Color(hex: 0x4ADE80)
    static let werewolf = Color(hex: 0xF59E0B)

    static let radius: CGFloat = 14
    // Small labels like the "You" tag. Radius 14 on something that short would turn it into a pill.
    static let badgeRadius: CGFloat = 6
    static let borderWidth: CGFloat = 2
    // Side margin for game and account screens.
    static let gutter: CGFloat = 20

    static let displayFontName = "BricolageGrotesque-ExtraBold"
}

extension Font {
    // Bricolage Grotesque ExtraBold for headings. It grows with Dynamic Type like the text style it's given.
    static func display(_ style: Font.TextStyle = .largeTitle) -> Font {
        .custom(Theme.displayFontName, size: style.defaultSize, relativeTo: style)
    }

    // Numbers (countdowns, room codes) in SF Mono, so digits don't shift as they change.
    static func numbers(_ style: Font.TextStyle = .body) -> Font {
        .system(style, design: .monospaced).weight(.bold)
    }
}

extension UIFont {
    // For UIKit-drawn text such as the navigation bar title. Falls back to the system font if the file is missing.
    static func display(size: CGFloat) -> UIFont {
        UIFont(name: Theme.displayFontName, size: size) ?? .systemFont(ofSize: size, weight: .heavy)
    }
}

private extension Font.TextStyle {
    // Point sizes at the default text size, from Apple's type scale.
    var defaultSize: CGFloat {
        switch self {
        case .largeTitle: 34
        case .title: 28
        case .title2: 22
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        case .caption2: 11
        @unknown default: 17
        }
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}
