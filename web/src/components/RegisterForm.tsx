interface RegisterProps {
  name: string;
  email: string;
  password: string;
  loading: boolean;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
}

function RegisterForm({
  name,
  email,
  password,
  loading,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: RegisterProps) {
  const isPasswordTooShort = password.length > 0 && password.length < 8;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="form-group">
        <label htmlFor="register-name" className="form-label">
          Full / Display Name (optional)
        </label>
        <input
          id="register-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Your Name"
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="register-email" className="form-label">
          Email Address
        </label>
        <input
          id="register-email"
          type="email"
          required
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="user@ucf.edu"
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="register-password" className="form-label">
          Password (min. 8 characters)
        </label>
        <input
          id="register-password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="••••••••"
          className="form-input"
          aria-describedby="register-password-rule"
        />
        <small
          id="register-password-rule"
          style={{
            display: 'block',
            marginTop: '0.35rem',
            color: isPasswordTooShort ? '#fca5a5' : 'inherit',
            opacity: isPasswordTooShort ? 1 : 0.75,
          }}
        >
          Password must be at least 8 characters.
        </small>
      </div>

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Creating Account...' : 'Register'}
      </button>
    </form>
  )
}

export default RegisterForm