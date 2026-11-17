import { useEffect, useState, type FormEvent } from 'react';

interface ResetPasswordPageProps {
  onDone: () => void;
}

const INVALID_LINK = 'This link is invalid or has expired';

export default function ResetPasswordPage({ onDone }: ResetPasswordPageProps) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(token ? '' : INVALID_LINK);
  const [linkInvalid, setLinkInvalid] = useState(!token);
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) window.history.replaceState(null, '', '/reset-password');
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error || 'Could not reset your password.';
        if (message === INVALID_LINK) setLinkInvalid(true);
        throw new Error(message);
      }
      setSuccessMsg(data.message || 'Password updated, sign in again');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not reset your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2 className="card-title">Reset Password</h2>
      {errorMsg && <div className="alert-error" role="alert">{errorMsg}</div>}
      {successMsg ? (
        <>
          <div className="alert-success" role="status">{successMsg}</div>
          <button type="button" className="btn-primary" onClick={onDone}>Return to Sign In</button>
        </>
      ) : token && !linkInvalid ? (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-password">New Password</label>
            <input
              id="reset-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="confirm-reset-password">Confirm Password</label>
            <input
              id="confirm-reset-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      ) : (
        <button type="button" className="btn-primary" onClick={onDone}>Back to Sign In</button>
      )}
    </div>
  );
}
