import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';

// PR-4: HQ-editable system settings (super_admin only). Thresholds that used to
// be hard-coded backend constants. GET/PUT /admin/settings.
// P7: also controls the customer-app menu "best value" card (auto / pin / off).

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export default function HqSettings() {
  const [hqThreshold, setHqThreshold] = useState('');
  const [freeDelivery, setFreeDelivery] = useState('');
  // P7: best-value card control
  const [vcMode, setVcMode] = useState('auto');
  const [vcProductId, setVcProductId] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // §10: super-admin recovery phone (write-only; no read endpoint for current value)
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneErr, setPhoneErr] = useState('');
  const [phoneMsg, setPhoneMsg] = useState('');

  const saveRecoveryPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneErr(''); setPhoneMsg('');
    const digits = recoveryPhone.replace(/\D/g, '');
    if (digits.length !== 10) { setPhoneErr('Enter a 10-digit phone number.'); return; }
    setSavingPhone(true);
    try {
      await api('/auth/super/recovery-phone', { method: 'PUT', body: { phone: digits } });
      setPhoneMsg('Recovery phone updated.');
      setRecoveryPhone('');
    } catch (e) {
      setPhoneErr(errMsg(e));
    } finally {
      setSavingPhone(false);
    }
  };

  const applySettings = (s: any) => {
    setHqThreshold(String(s.hq_value_threshold ?? ''));
    setFreeDelivery(String(s.free_delivery_threshold ?? ''));
    setVcMode(s.value_card?.mode ?? 'auto');
    setVcProductId(s.value_card?.product_id ?? '');
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const s = await api('/admin/settings');
      applySettings(s);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // Product list for the pin picker — same endpoint the other HQ pages use.
    api('/products').then(setProducts).catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      if (vcMode === 'pin' && !vcProductId) {
        setError('Pick a product to pin for the best value card.');
        setSaving(false);
        return;
      }
      const body: Record<string, unknown> = {};
      if (hqThreshold !== '') body.hq_value_threshold = parseFloat(hqThreshold);
      if (freeDelivery !== '') body.free_delivery_threshold = parseFloat(freeDelivery);
      body.value_card = { mode: vcMode, product_id: vcMode === 'pin' ? vcProductId : null };
      const s = await api('/admin/settings', { method: 'PUT', body });
      applySettings(s);
      setSaved(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="settings-page">
      <div className="page-header">
        <div><h1>Settings</h1><p>HQ-editable thresholds. Changes apply to new orders, discards &amp; reconciliations.</p></div>
      </div>

      {error && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="settings-error">{error}</div>}
      {saved && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 14 }} data-testid="settings-saved">Settings saved.</div>}

      {loading ? (
        <div style={{ padding: 30, color: '#9C9C9C' }} data-testid="settings-loading">Loading…</div>
      ) : (
        <form onSubmit={save} style={{ maxWidth: 460 }}>
          <div className="form-group">
            <label>HQ escalation threshold (₹)</label>
            <input type="number" step="any" min="0" value={hqThreshold} onChange={(e) => setHqThreshold(e.target.value)} data-testid="setting-hq-threshold" />
            <div style={{ fontSize: 12, color: '#9C9C9C', marginTop: 4 }}>Discards / refunds / count variances at or above this value require HQ (super_admin) approval.</div>
          </div>
          <div className="form-group">
            <label>Free-delivery threshold (₹)</label>
            <input type="number" step="any" min="0" value={freeDelivery} onChange={(e) => setFreeDelivery(e.target.value)} data-testid="setting-free-delivery" />
            <div style={{ fontSize: 12, color: '#9C9C9C', marginTop: 4 }}>Delivery orders at or above this subtotal get free delivery.</div>
          </div>

          {/* P7: best value card control */}
          <div className="form-group">
            <label>Best value card</label>
            <select value={vcMode} onChange={(e) => setVcMode(e.target.value)} data-testid="setting-value-card-mode">
              <option value="auto">Auto — best ₹/g protein</option>
              <option value="pin">Pin — show a chosen product</option>
              <option value="off">Off — hide the card</option>
            </select>
            <div style={{ fontSize: 12, color: '#9C9C9C', marginTop: 4 }}>Controls the "Today's best protein value" card on the customer menu. Auto picks the in-stock item with the lowest ₹ per gram of protein.</div>
          </div>
          {vcMode === 'pin' && (
            <div className="form-group">
              <label>Pinned product</label>
              <select value={vcProductId} onChange={(e) => setVcProductId(e.target.value)} data-testid="setting-value-card-product">
                <option value="">— pick a product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: '#9C9C9C', marginTop: 4 }}>If the pinned product goes missing or out of stock, the app falls back to Auto.</div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-settings-btn">{saving ? 'Saving…' : 'Save settings'}</button>
        </form>
      )}

      {/* §10: Super-admin recovery phone (self-service reset) */}
      <div style={{ marginTop: 36, maxWidth: 460, borderTop: '1px solid #E6E1D4', paddingTop: 24 }}>
        <h2 style={{ fontSize: 18, margin: '0 0 4px' }}>Recovery phone</h2>
        <p style={{ fontSize: 12, color: '#9C9C9C', marginBottom: 14 }}>Super-admin only. Used for self-service password reset. Stored securely — the current number isn't shown here for safety.</p>
        {phoneErr && <div className="badge badge-red" style={{ display: 'block', padding: 12, marginBottom: 12 }} data-testid="recovery-phone-error">{phoneErr}</div>}
        {phoneMsg && <div className="badge badge-green" style={{ display: 'block', padding: 12, marginBottom: 12 }} data-testid="recovery-phone-saved">{phoneMsg}</div>}
        <form onSubmit={saveRecoveryPhone}>
          <div className="form-group">
            <label>Recovery phone (10 digits)</label>
            <input
              value={recoveryPhone}
              onChange={(e) => setRecoveryPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit mobile number"
              inputMode="numeric"
              data-testid="recovery-phone-input"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={savingPhone || recoveryPhone.replace(/\D/g, '').length !== 10} data-testid="recovery-phone-save">
            {savingPhone ? 'Saving…' : 'Save recovery phone'}
          </button>
        </form>
      </div>
    </div>
  );
}
