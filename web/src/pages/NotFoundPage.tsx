import { Link } from 'react-router-dom';
import logo from '../assets/logo.svg';
import '../App.css';

export default function NotFoundPage() {
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
                <p className="lobby-join-heading" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                    404
                </p>
                <h1 style={{ fontSize: '1.35rem', marginBottom: '0.75rem', color: '#f3f2f3' }}>
                    Page Not Found
                </h1>
                <p style={{ color: '#a89fa8', marginBottom: '1.5rem' }}>
                    The shadows swallowed this path. Head back to the main hall to join or host a game.
                </p>
                <Link
                    to="/"
                    className="submit-btn"
                    style={{ display: 'inline-block', textDecoration: 'none', padding: '0.75rem 1.5rem' }}
                >
                    Return Home
                </Link>
            </main>
        </div>
    );
}