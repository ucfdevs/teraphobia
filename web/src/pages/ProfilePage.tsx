import { Link } from 'react-router-dom';
import logo from '../assets/logo.svg';
import '../App.css';

interface ProfilePageProps {
    username?: string;
    email?: string;
}

export default function ProfilePage({ username, email }: ProfilePageProps) {
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
                    Player Profile
                </h1>
                <p style={{ color: '#a89fa8', marginBottom: '1.25rem' }}>
                    {username ? `Signed in as ${username}${email ? ` (${email})` : ''}` : 'View your player stats and account details.'}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link to="/rooms/new" className="submit-btn" style={{ textDecoration: 'none', padding: '0.7rem 1.25rem' }}>
                        Create Room
                    </Link>
                    <Link to="/" className="lobby-secondary-btn" style={{ textDecoration: 'none', padding: '0.7rem 1.25rem' }}>
                        Home
                    </Link>
                </div>
            </main>
        </div>
    );
}