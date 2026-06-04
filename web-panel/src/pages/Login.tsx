import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { loginEmail, loginPin } = useAuth();
  const [tab, setTab] = useState<'admin' | 'staff'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) { setError('Enter at least 4 digits'); return; }
    setError('');
    setLoading(true);
    try {
      await loginPin(pin);
    } catch (err: any) {
      setError(err.message || 'Invalid PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="icon-bg">🍽</div>
          <h1>Diet Cafe</h1>
          <p>Management Panel</p>
        </div>

        <div style={{
          background: '#fff6f7',
          border: '1px solid #ffd5d9',
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          fontSize: 13,
          color: '#6d1f28'
        }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>Preview before testing</strong>
          <div>Admin: <code>admin@dietcafe.com</code> / <code>admin123</code></div>
          <div>Kitchen PIN: <code>1111</code> · Cashier PIN: <code>2222</code></div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>Use these credentials to verify login flow, then share next changes.</div>
        </div>

        <div className="login-tabs">
          <button className={`login-tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => { setTab('admin'); setError(''); }} data-testid="tab-admin">
            Admin Login
          </button>
          <button className={`login-tab ${tab === 'staff' ? 'active' : ''}`} onClick={() => { setTab('staff'); setError(''); }} data-testid="tab-staff">
            Staff PIN
          </button>
        </div>

        {error && <p className="login-error">{error}</p>}

        {tab === 'admin' ? (
          <form onSubmit={handleAdminLogin}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@dietcafe.com" data-testid="email-input" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" data-testid="password-input" />
            </div>
            <button type="submit" className="login-btn" disabled={loading || !email || !password} data-testid="admin-login-btn">
              {loading ? 'Logging in...' : 'Login as Admin'}
            </button>
            <div className="login-demo">
              <button type="button" onClick={() => { setEmail('admin@dietcafe.com'); setPassword('admin123'); }} data-testid="demo-btn">
                Use demo credentials
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePinLogin}>
            <div className="form-group">
              <label style={{ textAlign: 'center', display: 'block' }}>Enter your staff PIN</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                placeholder="Enter 4-6 digit PIN"
                data-testid="pin-input"
                style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 12 }}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPin(v);
                }}
                autoFocus
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading || pin.length < 4} data-testid="pin-login-btn">
              {loading ? 'Verifying...' : 'Login with PIN'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
