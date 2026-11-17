import { useCallback, useState, type FormEvent } from 'react';
import { Navigate, Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import logo from './assets/logo.svg';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import LandingPage from './pages/LandingPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import HostScreen, { type Session } from './host/HostScreen';
import ProfilePage from './pages/ProfilePage';
import CreateRoomPage from './pages/CreateRoomPage';
import LobbyPlaceholderPage from './pages/LobbyPlaceholderPage';
import NotFoundPage from './pages/NotFoundPage';
import JoinFallbackPage from './pages/JoinFallbackPage';
import GoogleSignInButton from './components/GoogleSignInButton';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

interface RoleItem {
  id: number;
  role: string;
  team: 'Innocents' | 'Monster';
  action: string;
  count: number;
}

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
}

const ACCESS_TOKEN_KEY = 'teraphobia_access_token';
const REFRESH_TOKEN_KEY = 'teraphobia_refresh_token';
const USER_STORAGE_KEY = 'user';

function getStoredSession(): Session | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) ?? '',
    issuedAt: Date.now(),
  };
}

export default function App() {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UserProfile) : null;
    } catch {
      return null;
    }
  });

  const [session, setSession] = useState<Session | null>(() => getStoredSession());

  // Auth form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Verification resend state on dashboard
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  // Dashboard states
  const [searchTerm, setSearchTerm] = useState('');
  const [roomFilter, setRoomFilter] = useState('All');

  const persistSession = (nextSession: Session | null, nextUser?: UserProfile | null) => {
    setSession(nextSession);
    if (nextSession?.accessToken) {
      localStorage.setItem(ACCESS_TOKEN_KEY, nextSession.accessToken);
      localStorage.setItem('accessToken', nextSession.accessToken);
      if (nextSession.refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, nextSession.refreshToken);
      }
      if (nextUser) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
      }
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem('accessToken');
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSignInNav = () => {
    resetForm();
    if (currentUser || session) {
      navigate('/app');
    } else {
      navigate('/signin');
    }
  };

  const handleHostGame = () => {
    if (currentUser && currentUser.emailVerified && session) {
      navigate('/host');
    } else if (currentUser) {
      navigate('/app');
    } else {
      resetForm();
      navigate('/signin');
    }
  };

  const handleRegister = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (password.length < 8) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setCurrentUser(data.user);
      persistSession(
        {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          issuedAt: Date.now(),
        },
        data.user
      );
      navigate('/profile');
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

  const handleLogin = async (e: FormEvent) => {
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
          password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }

      setCurrentUser(data.user);
      persistSession(
        {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          issuedAt: Date.now(),
        },
        data.user
      );
      navigate('/profile');
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
    persistSession(null);
    setResendMsg('');
    resetForm();
    navigate('/');
  };

  const handleGoogleCredential = useCallback(async (credential: string) => {
    setErrorMsg('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: credential }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Google sign in failed');
      setCurrentUser(data.user);
      persistSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        issuedAt: Date.now(),
      });
      navigate('/profile');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign in failed');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const handleUnauthorized = () => {
    setCurrentUser(null);
    persistSession(null);
    setResendMsg('');
    resetForm();
    navigate('/signin');
  };

  const goHome = () => {
    navigate('/');
  };

  const handleVerifyDone = () => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, emailVerified: true });
      navigate('/app');
    } else {
      resetForm();
      navigate('/signin');
    }
  };

  const handleResendVerification = async () => {
    if (!currentUser) return;
    setResending(true);
    setResendMsg('');
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

  const rolesData: RoleItem[] = [
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

  const renderHeader = () => (
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
  );

  const renderFog = () => (
    <div className="fog-wrapper">
      <div className="fog-layer fog-layer-1"></div>
      <div className="fog-layer fog-layer-2"></div>
    </div>
  );

  const renderLoginView = () => (
    <div className="app-wrapper">
      {renderFog()}
      {renderHeader()}
      <div className="auth-card">
        <h2 className="card-title">Sign In</h2>

        {errorMsg && (
          <div className="alert-error" role="alert">
            {errorMsg}
          </div>
        )}
        {successMsg && <div className="alert-success">{successMsg}</div>}

        <LoginForm
          email={email}
          password={password}
          loading={loading}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onSubmit={handleLogin}
        />

        <GoogleSignInButton onCredential={handleGoogleCredential} />

        <div className="card-footer">
          <button
            type="button"
            onClick={() => {
              resetForm();
              navigate('/forgot-password');
            }}
            className="btn-link"
          >
            Forgot password?
          </button>
        </div>

        <div className="card-footer">
          <div style={{ marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                resetForm();
                navigate('/forgot-password');
              }}
              className="btn-link"
            >
              Forgot password?
            </button>
          </div>
          Need an account?{' '}
          <button
            type="button"
            onClick={() => {
              resetForm();
              navigate('/register');
            }}
            className="btn-link"
          >
            Register here
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <Routes>
      {/* LANDING VIEW */}
      <Route
        path="/"
        element={
          <div className="app-wrapper">
            {renderFog()}
            {renderHeader()}
            <LandingPage
              isAuthenticated={!!(currentUser || session)}
              onHostGame={handleHostGame}
              onSignIn={handleSignInNav}
            />
          </div>
        }
      />

      {/* LOGIN & SIGNIN VIEWS */}
      <Route path="/login" element={renderLoginView()} />
      <Route path="/signin" element={renderLoginView()} />

      {/* FORGOT PASSWORD VIEW */}
      <Route
        path="/forgot-password"
        element={
          <div className="app-wrapper">
            {renderFog()}
            {renderHeader()}
            <div className="auth-card">
              <h2 className="card-title">Reset Password</h2>
              <p style={{ marginBottom: '1.25rem', opacity: 0.85 }}>
                Password reset via email is coming soon. Please contact support or try signing in again.
              </p>
              <button
                type="button"
                onClick={() => navigate('/signin')}
                className="btn-primary"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        }
      />

      {/* VERIFY EMAIL VIEW */}
      <Route
        path="/verify"
        element={
          <div className="app-wrapper">
            {renderFog()}
            {renderHeader()}
            <VerifyEmailPage email={currentUser?.email} onDone={handleVerifyDone} />
          </div>
        }
      />

      <Route
        path="/forgot-password"
        element={
          <div className="app-wrapper">
            {renderFog()}
            {renderHeader()}
            <ForgotPasswordPage onBack={() => navigate('/signin')} />
          </div>
        }
      />

      <Route
        path="/reset-password"
        element={
          <div className="app-wrapper">
            {renderFog()}
            {renderHeader()}
            <ResetPasswordPage onDone={() => navigate('/signin')} />
          </div>
        }
      />

      {/* REGISTER VIEW */}
      <Route
        path="/register"
        element={
          <div className="app-wrapper">
            {renderFog()}
            {renderHeader()}
            <div className="auth-card">
              <h2 className="card-title">Create Account</h2>

              {errorMsg && (
                <div className="alert-error" role="alert">
                  {errorMsg}
                </div>
              )}

              <RegisterForm
                name={name}
                email={email}
                password={password}
                loading={loading}
                onNameChange={setName}
                onEmailChange={setEmail}
                onPasswordChange={setPassword}
                onSubmit={handleRegister}
              />

              <GoogleSignInButton
                onCredential={handleGoogleCredential}
                text="signup_with"
              />

              <div className="card-footer">
                Already registered?
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    navigate('/signin');
                  }}
                  className="btn-link"
                >
                  Return to Login
                </button>
              </div>
            </div>
          </div>
        }
      />

      {/* HOST VIEW: create a room and run the shared screen */}
      <Route
        path="/host"
        element={
          currentUser && session ? (
            <div className="app-wrapper">
              {renderFog()}
              {renderHeader()}
              <HostScreen
                session={session}
                onSessionChange={persistSession}
                onExit={() => navigate('/app')}
              />
            </div>
          ) : (
            <NotFoundPage />
          )
        }
      />

      {/* DASHBOARD VIEW */}
      <Route
        path="/app"
        element={
          currentUser ? (
            <div className="app-wrapper">
              {renderFog()}
              {renderHeader()}
              <div className="dashboard-card">
                <div className="dash-header">
                  <div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f8fafc' }}>
                      Welcome, {currentUser.displayName}
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{currentUser.email}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => navigate('/profile')}
                      className="btn-secondary"
                    >
                      Profile &amp; Stats
                    </button>
                    <button type="button" onClick={handleLogout} className="btn-secondary">
                      Sign Out
                    </button>
                  </div>
                </div>

                {currentUser.emailVerified && session && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => navigate('/host')}
                    style={{ marginBottom: '1.5rem' }}
                  >
                    Host a game
                  </button>
                )}

                {!currentUser.emailVerified && session && (
                  <div className="alert-error" role="alert">
                    Verify your email to host games. Check your inbox for the link.{' '}
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resending}
                      className="btn-link"
                    >
                      {resending ? 'Sending…' : 'Resend link'}
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
                      className="form-select"
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
            </div>
          ) : (
            <Navigate replace to="/signin" />
          )
        }
      />

      {/* ISSUE #16 PROFILE & STATS ROUTE */}
      <Route
        path="/profile"
        element={
          session?.accessToken ? (
            <div className="app-wrapper">
              {renderFog()}
              {renderHeader()}
              <ProfilePage
                accessToken={session.accessToken}
                onBack={() => (currentUser ? navigate('/app') : navigate('/'))}
                onProfileUpdated={(newName) =>
                  setCurrentUser((prev) => (prev ? { ...prev, displayName: newName } : prev))
                }
                onTokenRotated={(newToken) =>
                  persistSession({
                    accessToken: newToken,
                    refreshToken: session.refreshToken,
                    issuedAt: Date.now(),
                  })
                }
                onUnauthorized={handleUnauthorized}
              />
            </div>
          ) : (
            <Navigate replace to="/signin" />
          )
        }
      />

      {/* ISSUE #34 JOIN LINK FALLBACK (app not installed) */}
      <Route
        path="/join/:code"
        element={
          <div className="app-wrapper">
            {renderFog()}
            {renderHeader()}
            <JoinFallbackPage />
          </div>
        }
      />

      {/* ISSUE #11 REQUIRED ROUTES */}
      <Route path="/rooms/new" element={<CreateRoomPage />} />
      <Route path="/lobby" element={<LobbyPlaceholderPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes >
  );
}
