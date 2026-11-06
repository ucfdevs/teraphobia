interface LoginProps {
    email: string;
    password: string;
    loading: boolean;
    onEmailChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;

}

function LoginForm({email,
                    password,
                    loading,
                    onEmailChange,
                    onPasswordChange,
                    onSubmit,} : LoginProps) {
    return (
        <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Email / Login</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="user@ucf.edu"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                className="form-input"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
    )
}
export default LoginForm