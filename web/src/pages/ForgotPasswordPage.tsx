import { useState, type FormEvent } from 'react';

interface ForgotPasswordPageProps {
  onBack: () => void;
}

export default function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(
        data.message ||
          'If an account with that email exists, a password reset link will be sent.',
      );
    } catch {
      setMessage('If an account with that email exists, a password reset link will be sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2 className="card-title">Forgot Password</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@ucf.edu"
            className="form-input"
          />
        </div>
        {message && <div className="alert-success" role="status">{message}</div>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>
      <div className="card-footer">
        <button type="button" onClick={onBack} className="btn-link">Back to Sign In</button>
      </div>
    </div>
  );
}
