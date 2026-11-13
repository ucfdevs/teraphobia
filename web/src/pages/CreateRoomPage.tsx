import { Link } from 'react-router-dom';
import logo from '../assets/logo.svg';
import '../App.css';

export default function CreateRoomPage() {
    return (
        <div className="app-wrapper">
            <div className="fog-wrapper" aria-hidden="true">
                <div className="fog-layer-1"></div>
                <div className="fog-layer-2"></div>
            </div>

            <header className="brand-header">
                <img src={logo} alt="Teraphobia" className="brand-logo" />
                <p className="brand-subtitle">HALLOWEEN SOCIAL DEDUCTION GAME</p>
            </header>

            <main className="lobby-card" style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '1.4rem', marginBottom: '0.75rem', color: '#f3f2f3' }}>
                    Create a Room
                </h1>
                <p style={{ color: '#a89fa8', marginBottom: '1.25rem' }}>
                    Configure your Teraphobia lobby settings and launch a session.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link to="/lobby" className="submit-btn" style={{ textDecoration: 'none', padding: '0.7rem 1.25rem' }}>
                        Go to Lobby
                    </Link>
                    <Link to="/" className="lobby-secondary-btn" style={{ textDecoration: 'none', padding: '0.7rem 1.25rem' }}>
                        Home
                    </Link>
                </div>
            </main>
        </div>
    );
}