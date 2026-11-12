import SwiftUI

/// Teraphobia iOS Design Tokens — synced with shared/design-tokens.json
enum TeraphobiaTokens {
    enum Colors {
        static let background = Color(hex: 0x090D1A)
        static let backgroundElevated = Color(hex: 0x11162B)
        static let surface = Color(hex: 0x141B2E)
        static let surfaceHover = Color(hex: 0x1C2540)
        static let border = Color(hex: 0x2A3554)
        static let text = Color(hex: 0xF8FAFC)
        static let mutedText = Color(hex: 0x94A3B8)
        static let accent = Color(hex: 0xF97316)
        static let accentHover = Color(hex: 0xFB923C)
        static let accentText = Color(hex: 0x090D1A)
        static let danger = Color(hex: 0xDC2626)
        static let dangerHover = Color(hex: 0xB91C1C)
        static let dangerLight = Color(hex: 0xFCA5A5)
        static let dangerText = Color(hex: 0xFFFFFF)
    }

    enum Typography {
        static let fontDisplayName = "BricolageGrotesque-Bold"
        static let fontBodyName = "IBMPlexSans-Regular"
        static let fontMonoName = "IBMPlexMono-Regular"

        static let xs: CGFloat = 12
        static let sm: CGFloat = 14
        static let base: CGFloat = 16
        static let lg: CGFloat = 18
        static let xl: CGFloat = 20
        static let xxl: CGFloat = 24
        static let xxxl: CGFloat = 32
        static let xxxxl: CGFloat = 44

        static func display(_ size: CGFloat = xxl) -> Font {
            .custom(fontDisplayName, size: size, relativeTo: .title)
        }

        static func body(_ size: CGFloat = base) -> Font {
            .custom(fontBodyName, size: size, relativeTo: .body)
        }

        static func mono(_ size: CGFloat = sm) -> Font {
            .custom(fontMonoName, size: size, relativeTo: .caption)
        }
    }

    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let xxxl: CGFloat = 48
    }

    enum Radii {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 14
        static let xl: CGFloat = 20
        static let full: CGFloat = 9999
    }
}

private extension Color {
    init(hex: UInt32, alpha: Double = 1.0) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: alpha)
    }
}