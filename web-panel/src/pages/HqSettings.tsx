import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';

// PR-4: HQ-editable system settings (super_admin only). Thresholds that used to
// be hard-coded backend constants. GET/PUT /admin/settings.

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export default function HqSettings() {
  const [hqThreshold, setHqThreshold] = useState('');
  const [freeDelivery, setFreeDelivery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const s = await api('/admin/settings');
      setHqThreshold(String(s.hq_value_threshold ?? ''));
      setFreeDelivery(String(s.free_delivery_threshold ?? ''));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const body: Record<string, number> = {};
      if (hqThreshold !== '') body.hq_value_threshold = parseFloat(hqThreshold);
      if (freeDelivery !== '') body.free_delivery_threshold = parseFloat(freeDelivery);
      const s = await api('/admin/settings', { method: 'PUT', body });
      setHqThreshold(String(s.hq_value_threshold ?? ''));
      setFreeDelivery(String(s.free_delivery_threshold ?? ''));
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
          <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-settings-btn">{saving ? 'Saving…' : 'Save settings'}</button>
        </form>
      )}
    </div>
  );
}
