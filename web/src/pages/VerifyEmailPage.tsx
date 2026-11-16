import { useEffect, useRef, useState } from 'react';

interface VerifyEmailPageProps {
  email?: string;
  onDone: () => void;
}

type Status = 'verifying' | 'success' | 'error';

const INVALID_LINK = 'This link is invalid or has expired';

// Opened from the emailed link: /verify?token=...
export default function VerifyEmailPage({ email = '', onDone }: VerifyEmailPageProps) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token'));
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error');
  const [errorMsg, setErrorMsg] = useState(token ? '' : INVALID_LINK);
  const [resendEmail, setResendEmail] = useState(email);
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);
  // StrictMode runs effects twice in dev; a second POST would spend the token and show a false error.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Keep the token out of the address bar and browser history.
    window.history.replaceState(null, '', '/verify');
    if (!token) return;

    (async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || INVALID_LINK);
        setStatus('success');
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not verify your email.');
        setStatus('error');
      }
    })();
  }, [token]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendMsg('');
    setResending(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setResendMsg(data.message || data.error || 'Could not send a new link.');
    } catch {
      setResendMsg('Could not send a new link.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-card">
      <h2 className="card-title">Verify Email</h2>

      {status === 'verifying' && <p role="status">Verifying your email...</p>}

      {status === 'success' && (
        <>
          <div className="alert-success" role="status">
            Email verified. You can now host games.
          </div>
          <button type="button" className="btn-primary" onClick={onDone}>
            Continue
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="alert-error" role="alert">{errorMsg}</div>
          <form onSubmit={handleResend}>
            <div className="form-group">
              <label className="form-label" htmlFor="resend-email">Send a new link to</label>
              <input
                id="resend-email"
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                placeholder="user@ucf.edu"
                className="form-input"
              />
            </div>
            {resendMsg && <div className="alert-success" role="status">{resendMsg}</div>}
            <button type="submit" disabled={resending} className="btn-primary">
              {resending ? 'Sending...' : 'Send a new link'}
            </button>
          </form>
          <div className="card-footer">
            <button type="button" onClick={onDone} className="btn-link">
              Back to Sign In
            </button>
          </div>
        </>
      )}
    </div>
  );
}
