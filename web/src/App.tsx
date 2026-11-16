import { useState } from 'react';
import LoginForm from './components/LoginForm';
import LandingPage from './pages/LandingPage';
import logo from './assets/logo.svg';
import './App.css';
import RegisterForm from './components/RegisterForm';
import VerifyEmailPage from './pages/VerifyEmailPage';
import HostScreen from './host/HostScreen';
import type { Session } from './host/HostScreen';

interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export default function App() {
  // The emailed verification link opens /verify?token=..., so start on that view.
  const [view, setView] = useState<'landing' | 'login' | 'register' | 'app' | 'verify' | 'host'>(() =>
    window.location.pathname === '/verify' ? 'verify' : 'landing'
  );

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  // Tokens from sign in, kept in memory only. The host screen needs them for POST /rooms and its socket.
  const [session, setSession] = useState<Session | null>(null);

  // Resend verification from the dashboard
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);

  // Table filter state
  const [roomFilter, setRoomFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleHostGame = () => {
    if (currentUser) {
      setView(currentUser.emailVerified && session ? 'host' : 'app');
    } else {
      resetForm();
      setView('login');
    }
  };

  const handleSignInNav = () => {
    resetForm();
    setView('login');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          email: email.trim(),
          password: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccessMsg('Account created! Check your email for a link to verify it, then sign in.');
      setView('login');
      setPassword('');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An error occurred during registration.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      setCurrentUser(data.user);
      setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, issuedAt: Date.now() });
      setView('app');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Invalid username or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSession(null);
    setResendMsg('');
    resetForm();
    setView('landing');
  };

  const goHome = () => {
    window.history.replaceState(null, '', '/');
    setView('landing');
  };

  const handleVerifyDone = () => {
    window.history.replaceState(null, '', '/');
    if (currentUser) {
      setCurrentUser({ ...currentUser, emailVerified: true });
      setView('app');
    } else {
      resetForm();
      setView('login');
    }
  };

  const handleResendVerification = async () => {
    if (!currentUser) return;
    setResendMsg('');
    setResending(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email }),
      });
      const data = await res.json().catch(() => ({}));
      setResendMsg(data.message || data.error || 'Could not send a new link.');
    } catch {
      setResendMsg('Could not send a new link.');
    } finally {
      setResending(false);
    }
  };

  const rolesData = [
    { id: 1, role: 'Villager', team: 'Innocents', action: 'Search / Commune / Candle', count: 5 },
    { id: 2, role: 'Vampire', team: 'Monster', action: 'Block Day Action', count: 1 },
    { id: 3, role: 'Witch', team: 'Monster', action: 'Plant Fake Clue', count: 1 },
    { id: 4, role: 'Werewolf', team: 'Monster', action: 'Night Double Kill', count: 1 },
  ];

  const filteredRoles = rolesData.filter((r) => {
    const matchesFilter = roomFilter === 'All' || r.team === roomFilter;
    const matchesSearch = r.role.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="app-wrapper">
      {/* HALLOWEEN FOG ANIMATION LAYERS */}
      <div className="fog-wrapper">
        <div className="fog-layer fog-layer-1"></div>
        <div className="fog-layer fog-layer-2"></div>
      </div>

      <header className="brand-header">
        <button
          type="button"
          onClick={goHome}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-label="Return to home page"
        >
          <img src={logo} alt="Teraphobia Logo" className="brand-logo" />
        </button>
        <p className="brand-subtitle">Halloween Social Deduction Game</p>
      </header>
      {/* LANDING VIEW */}
      {view === 'landing' && (
        <LandingPage
          isAuthenticated={!!currentUser}
          onHostGame={handleHostGame}
          onSignIn={handleSignInNav}
        />
      )}

      {/* LOGIN VIEW */}
      {view === 'login' && (
        <div className="auth-card">
          <h2 className="card-title">Sign In</h2>

          {errorMsg && <div className="alert-error">{errorMsg}</div>}
          {successMsg && <div className="alert-success">{successMsg}</div>}

          <LoginForm email={email} password={password} loading={loading}
            onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={handleLogin} />

          <div className="card-footer">
            Need an account?
            <button
              type="button"
              onClick={() => { resetForm(); setView('register'); }}
              className="btn-link"
            >
              Register here
            </button>
          </div>
        </div>
      )

      }

      {/* VERIFY EMAIL VIEW */}
      {view === 'verify' && <VerifyEmailPage email={currentUser?.email} onDone={handleVerifyDone} />}

      {/* REGISTER VIEW */}
      {view === 'register' && (
        <div className="auth-card">
          <h2 className="card-title">Create Account</h2>

          {errorMsg && <div className="alert-error">{errorMsg}</div>}

          <RegisterForm name={name} email={email} password={password} loading={loading}
            onNameChange={setName} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={handleRegister} />

          <div className="card-footer">
            Already registered?
            <button
              type="button"
              onClick={() => { resetForm(); setView('login'); }}
              className="btn-link"
            >
              Return to Login
            </button>
          </div>
        </div>
      )}

      {/* HOST VIEW: create a room and run the shared screen */}
      {view === 'host' && currentUser && session && (
        <HostScreen session={session} onSessionChange={setSession} onExit={() => setView('app')} />
      )}

      {/* DASHBOARD VIEW */}
      {view === 'app' && currentUser && (
        <div className="dashboard-card">
          <div className="dash-header">
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc' }}>Welcome, {currentUser.displayName}!</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{currentUser.email}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              Sign Out
            </button>
          </div>

          {currentUser.emailVerified && session && (
            <button type="button" className="btn-primary" onClick={() => setView('host')} style={{ marginBottom: '1.5rem' }}>
              Host a game
            </button>
          )}

          {!currentUser.emailVerified && (
            <div className="alert-error" role="alert">
              Verify your email to host games. Check your inbox for the link.{' '}
              <button type="button" onClick={handleResendVerification} disabled={resending} className="btn-link">
                {resending ? 'Sending...' : 'Resend link'}
              </button>
              {resendMsg && <div role="status">{resendMsg}</div>}
            </div>
          )}

          <div className="controls-grid">
            <div>
              <label className="form-label">Search Roles</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by role..."
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Filter Team</label>
              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className="filter-select"
              >
                <option value="All">All Teams</option>
                <option value="Innocents">Innocents</option>
                <option value="Monster">Monster</option>
              </select>
            </div>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Primary Action</th>
                  <th className="text-right">Player Cap</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 600, color: '#ffffff' }}>{item.role}</td>
                    <td>{item.team}</td>
                    <td>{item.action}</td>
                    <td className="text-right">{item.count}</td>
                  </tr>
                ))}
                {filteredRoles.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>
                      No roles match criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
