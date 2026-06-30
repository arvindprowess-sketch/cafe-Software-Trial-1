import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

// PUBLIC page (outside the authed portal): super-admin self-service password
// reset. Step 1 requests a code (generic response — no account enumeration);
// step 2 confirms the code + a new password. Backend: /auth/super/reset/*.
const MIN_PASSWORD = 12;

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/super/reset/request', { method: 'POST', body: { identifier: identifier.trim() } });
      // Always generic — true whether or not the account exists.
      setInfo('If an account exists, a reset code has been sent via SMS and/or email. Enter it below.');
      setStep('confirm');
    } catch (err: any) {
      setError(err.message || 'Could not start password reset');
    } finally {
      setLoading(false);
    }
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api('/auth/super/reset/confirm', {
        method: 'POST',
        body: { identifier: identifier.trim(), code: code.trim(), new_password: newPassword },
      });
      setDone(true);
      setInfo('Password updated. Redirecting to sign in…');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: any) {
      setError(err.message || 'Invalid or expired reset code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/boraroc-logo.png" alt="BORAROC" className="icon-bg" style={{ objectFit: 'cover', borderRadius: 12 }} />
          <h1>BORAROC</h1>
          <p>Reset password</p>
        </div>

        {error && <p className="login-error" data-testid="reset-error">{error}</p>}
        {info && (
          <p
            data-testid={done ? 'reset-success' : 'reset-info'}
            style={{ color: 'var(--ink)', fontSize: 13, textAlign: 'center', marginBottom: 14, fontWeight: 600 }}
          >
            {info}
          </p>
        )}

        {step === 'request' ? (
          <form onSubmit={submitRequest}>
            <div className="form-group">
              <label>Email or recovery phone</label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="you@boraroc.com or 10-digit phone"
                autoComplete="username"
                autoFocus
                data-testid="reset-identifier-input"
              />
            </div>
            <button type="submit" className="login-btn" disabled={loading || !identifier.trim()} data-testid="reset-request-btn">
              {loading ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitConfirm}>
            <div className="form-group">
              <label>Reset code</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                autoFocus
                data-testid="reset-code-input"
              />
            </div>
            <div className="form-group">
              <label>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={`At least ${MIN_PASSWORD} characters`}
                autoComplete="new-password"
                data-testid="reset-new-password-input"
              />
            </div>
            <div className="form-group">
              <label>Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                data-testid="reset-confirm-password-input"
              />
            </div>
            <button
              type="submit"
              className="login-btn"
              disabled={loading || done || !code.trim() || !newPassword || !confirmPassword}
              data-testid="reset-confirm-btn"
            >
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        )}

        <div className="login-demo">
          <Link
            to="/login"
            data-testid="reset-back-to-login-link"
            style={{
              color: 'var(--lime-deep)', fontFamily: 'var(--font-brand)', fontSize: 13,
              fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.03em', textDecoration: 'none',
            }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
