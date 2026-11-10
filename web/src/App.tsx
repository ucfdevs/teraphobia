import { useState } from 'react';
import LoginForm from './components/LoginForm';
import logo from './assets/logo.svg';
import './App.css';
import RegisterForm from './components/RegisterForm';

interface User {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

export default function App() {
  const [view, setView] = useState<'login' | 'register' | 'app'>('login');

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

      setSuccessMsg('Account created successfully! Please log in.');
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
    resetForm();
    setView('login');
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
        <img src={logo} alt="Teraphobia Logo" className="brand-logo" />
        <p className="brand-subtitle">Halloween Social Deduction System</p>
      </header>
      {/* LOGIN VIEW */}
      {view === 'login' && (
        <div className="auth-card">
          <h2 className="card-title">Sign In</h2>

          {errorMsg && <div className="alert-error">{errorMsg}</div>}
          {successMsg && <div className="alert-success">{successMsg}</div>}

          <LoginForm email={email} password={password} loading={loading}
          onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={handleLogin}/>
        
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

      {/* DASHBOARD VIEW */}
      {view === 'app' && currentUser && (
        <div className="dashboard-card">
          <div className="dash-header">
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Welcome, {currentUser.displayName}!</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{currentUser.email}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              Sign Out
            </button>
          </div>

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
