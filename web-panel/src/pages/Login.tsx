import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Auth V2: one login window for everyone — login code OR email + password.
// No role tabs, no demo credentials. Redirect after login is handled by the
// /login route in App.tsx (role -> ROLE_DEFAULT_ROUTE).
export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || !identifier.trim() || !password;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/boraroc-logo.png" alt="BORAROC" className="icon-bg" style={{ objectFit: 'cover', borderRadius: 12 }} />
          <h1>BORAROC</h1>
          <p>Management Panel</p>
        </div>

        {error && <p className="login-error" data-testid="login-error">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Login code or email</label>
            <input
              type="text"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              placeholder="e.g. RIYA-CASH or you@boraroc.com"
              autoComplete="username"
              autoFocus
              data-testid="login-identifier-input"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              data-testid="login-password-input"
            />
          </div>
          <button type="submit" className="login-btn" disabled={disabled} data-testid="login-submit-btn">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="login-demo">
          <Link
            to="/reset"
            data-testid="forgot-password-link"
            style={{
              color: 'var(--lime-deep)', fontFamily: 'var(--font-brand)', fontSize: 13,
              fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.03em', textDecoration: 'none',
            }}
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
