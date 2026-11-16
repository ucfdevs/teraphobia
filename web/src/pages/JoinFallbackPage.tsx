import { useParams } from 'react-router-dom';

// Public TestFlight invite for the iOS app. Swap in the real link from App Store Connect.
const TESTFLIGHT_URL = 'https://testflight.apple.com/join/XXXXXXXX';

// Opened from /join/ABCD when the app isn't installed. With the app installed, iOS opens the app instead (#34).
export default function JoinFallbackPage() {
  const { code = '' } = useParams();
  // Same rule as the app: 4 letters, A-Z.
  const roomCode = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const hasCode = roomCode.length === 4;

  return (
    <div className="auth-card" style={{ textAlign: 'center' }}>
      <h2 className="card-title">Join the Game</h2>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
        Teraphobia is played in the iPhone app. Get it on TestFlight, then open it and type the room code.
      </p>

      {hasCode && (
        <>
          <p className="form-label">Room code</p>
          <p
            aria-label={`Room code ${roomCode.split('').join(' ')}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '3rem',
              fontWeight: 600,
              letterSpacing: '0.2em',
              paddingLeft: '0.2em',
              color: 'var(--color-accent)',
              marginBottom: '1.5rem',
            }}
          >
            {roomCode}
          </p>
        </>
      )}

      <a
        href={TESTFLIGHT_URL}
        className="btn-primary"
        style={{ display: 'block', boxSizing: 'border-box', textDecoration: 'none' }}
      >
        Get the app on TestFlight
      </a>

      <div className="card-footer">Already have the app? Open it and type the code.</div>
    </div>
  );
}
