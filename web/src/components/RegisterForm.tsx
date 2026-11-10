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

function RegisterForm({name, email, password, loading, 
                       onNameChange, onEmailChange, onPasswordChange, 
                       onSubmit} : RegisterProps) {
    return (
        <form onSubmit={onSubmit}>
            <div className="form-group">
              <label className="form-label">Full / Display Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Your Name"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email Address</label>
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
              <label className="form-label">Password (min. 8 characters)</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="••••••••"
                className="form-input"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Creating Account...' : 'Register'}
            </button>
          </form>
    )
}
export default RegisterForm