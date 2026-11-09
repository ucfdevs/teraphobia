
interface LandingPageProps {
    isAuthenticated: boolean;
    onHostGame: () => void;
    onSignIn: () => void;
}

export default function LandingPage({
    isAuthenticated,
    onHostGame,
    onSignIn,
}: LandingPageProps) {
    return (
        <main className="landing-container">
            {/* Hero Section */}
            <section className="landing-hero" aria-labelledby="hero-title">
                <h1 id="hero-title" className="landing-title">
                    Unmask the Monster. Survive the Night.
                </h1>
                <p className="landing-pitch">
                    Teraphobia is a Halloween social deduction party game for 4 to 8 players in one room.
                    A shared host screen runs the town's fate while each player uses their phone as a private controller
                    to gather clues, cast spells, and root out the imposter.
                </p>

                {/* Action CTAs */}
                <div className="landing-actions">
                    <button
                        type="button"
                        onClick={onHostGame}
                        className="btn-primary landing-btn"
                        aria-label="Host a new game room"
                    >
                        Host a Game
                    </button>
                    {!isAuthenticated && (
                        <button
                            type="button"
                            onClick={onSignIn}
                            className="btn-secondary landing-btn"
                            aria-label="Sign in to your account"
                        >
                            Sign In
                        </button>
                    )}
                </div>
            </section>

            {/* How it Works - Exactly 3 Steps */}
            <section className="landing-how" aria-labelledby="how-title">
                <h2 id="how-title" className="landing-section-heading">
                    How It Works
                </h2>
                <div className="steps-grid">
                    <article className="step-card">
                        <div className="step-number" aria-hidden="true">1</div>
                        <h3 className="step-title">Join with a Code</h3>
                        <p className="step-desc">
                            Scan the shared screen's QR code or type in the 4-letter room code on your phone to enter the lobby.
                        </p>
                    </article>

                    <article className="step-card">
                        <div className="step-number" aria-hidden="true">2</div>
                        <h3 className="step-title">Find Clues by Day</h3>
                        <p className="step-desc">
                            Villagers privately search crime scenes, commune with the dead, or light protective candles while the Monster schemes in secret.
                        </p>
                    </article>

                    <article className="step-card">
                        <div className="step-number" aria-hidden="true">3</div>
                        <h3 className="step-title">Vote Out the Monster</h3>
                        <p className="step-desc">
                            Debate claims, weed out deceit, and cast private votes on your device before the shared screen reveals who is banished.
                        </p>
                    </article>
                </div>
            </section>
        </main>
    );
}