import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useRealtime } from '../utils/realtime';

// ── HQ Command Center — Strip 1 PULSE (lives at the top of /admin) ──
type Pulse = {
  range: 'today' | 'week' | 'month';
  revenue: number; revenue_delta_pct: number | null;
  orders: number; aov: number; aov_delta_pct: number | null;
  active_stores: number; total_stores: number;
  stores_not_opened: { store_id: string; name: string }[];
  critical_alerts: number;
};
const PULSE_RANGES: { key: Pulse['range']; label: string }[] = [
  { key: 'today', label: 'Today' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' },
];
const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
const deltaSuffix = (r: Pulse['range']) => (r === 'today' ? 'vs same weekday' : r === 'week' ? 'vs prev 7d' : 'vs prev 30d');
function Delta({ pct, suffix }: { pct: number | null; suffix: string }) {
  if (pct === null || pct === undefined) return <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>— no baseline</span>;
  const up = pct >= 0;
  return (
    <span style={{ color: up ? 'var(--success)' : 'var(--error)', fontSize: 12, fontWeight: 700 }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{suffix}</span>
    </span>
  );
}

export default function AdminDashboard() {
  const [range, setRange] = useState<Pulse['range']>('today');
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [pulseLoading, setPulseLoading] = useState(true);
  const [pulseError, setPulseError] = useState('');

  const loadPulse = useCallback(async () => {
    setPulseLoading(true); setPulseError('');
    try { setPulse(await api(`/hq/pulse?range=${range}`)); }
    catch (e: any) { setPulseError(e?.message || 'Failed'); }
    finally { setPulseLoading(false); }
  }, [range]);
  useEffect(() => { loadPulse(); }, [loadPulse]);
  useRealtime(['hq'], (msg) => {
    if (['new_order', 'order_status', 'business_day'].includes(msg.type)) loadPulse();
  });

  const [stats, setStats] = useState<any>({ products: 0, categories: 0, today_orders: 0, pending_orders: 0, revenue: 0, low_stock_alerts: [] });
  const [staff, setStaff] = useState<any[]>([]);
  const [resetPinId, setResetPinId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [expiring, setExpiring] = useState<any[]>([]);  // PR-2: compliance expiring soon

  useEffect(() => {
    (async () => {
      try {
        const [s, st] = await Promise.all([api('/admin/dashboard-stats'), api('/admin/staff-accounts')]);
        setStats(s);
        setStaff(st);
      } catch {}
      // PR-2: compliance expiring within 30 days (best-effort; non-fatal)
      try { setExpiring(await api('/stores/compliance/expiring')); } catch {}
    })();
  }, []);

  const resetPin = async () => {
    if (!resetPinId || !newPin) return;
    try {
      await api(`/admin/staff/${resetPinId}/reset-pin`, { method: 'PUT', body: { pin: newPin } });
      alert('PIN updated successfully');
      setResetPinId('');
      setNewPin('');
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Dashboard</h1><p>BORAROC Control Center</p></div>
        <div className="time-switcher" data-testid="time-switcher" style={{ display: 'flex', gap: 8 }}>
          {PULSE_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-pill)',
                border: '1.5px solid ' + (range === r.key ? 'var(--ink)' : 'var(--border)'),
                background: range === r.key ? 'var(--ink)' : 'var(--white)',
                color: range === r.key ? 'var(--white)' : 'var(--muted)',
                fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* HQ Command Center — Strip 1 PULSE (live, across all stores) */}
      {pulseLoading ? (
        <div className="stats-grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="stat-card" style={{ height: 120, background: 'var(--border)', opacity: 0.5 }} />)}
        </div>
      ) : pulseError ? (
        <div className="stat-card" style={{ textAlign: 'center', padding: 32, marginBottom: 28 }}>
          <p style={{ color: 'var(--error)', fontWeight: 600, marginBottom: 12 }}>Couldn't load pulse.</p>
          <button onClick={loadPulse} style={{ padding: '10px 20px', borderRadius: 'var(--radius-pill)', border: 'none', background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : pulse ? (
        <div className="stats-grid">
          <div className="stat-card" data-testid="pulse-revenue">
            <div className="stat-icon" style={{ background: '#15140F15' }}>💰</div>
            <div className="stat-value">{inr(pulse.revenue)}</div>
            <div className="stat-label">Revenue</div>
            <div style={{ textAlign: 'center', marginTop: 6 }}><Delta pct={pulse.revenue_delta_pct} suffix={deltaSuffix(pulse.range)} /></div>
          </div>
          <div className="stat-card" data-testid="pulse-orders">
            <div className="stat-icon" style={{ background: '#A6D62E22' }}>🧾</div>
            <div className="stat-value">{pulse.orders}</div>
            <div className="stat-label">Orders</div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, fontWeight: 600 }}>AOV {inr(pulse.aov)} <Delta pct={pulse.aov_delta_pct} suffix={deltaSuffix(pulse.range)} /></div>
          </div>
          <div className="stat-card" data-testid="pulse-active-stores">
            <div className="stat-icon" style={{ background: '#5E97B822' }}>🏪</div>
            <div className="stat-value">{pulse.active_stores}/{pulse.total_stores}</div>
            <div className="stat-label">Active Stores</div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{pulse.stores_not_opened.length > 0 ? `${pulse.stores_not_opened.length} not opened` : 'all open'}</div>
          </div>
          <div className="stat-card" data-testid="pulse-alerts" style={{ background: pulse.critical_alerts > 0 ? '#C0392B' : 'var(--white)', borderColor: pulse.critical_alerts > 0 ? '#C0392B' : 'var(--border)' }}>
            <div className="stat-icon" style={{ background: pulse.critical_alerts > 0 ? '#ffffff22' : '#C0392B15' }}>⚠️</div>
            <div className="stat-value" style={{ color: pulse.critical_alerts > 0 ? 'var(--white)' : 'var(--ink)' }}>{pulse.critical_alerts}</div>
            <div className="stat-label" style={{ color: pulse.critical_alerts > 0 ? '#ffffffcc' : 'var(--muted)' }}>Critical Alerts</div>
          </div>
        </div>
      ) : null}

      <div className="stats-grid" data-testid="stats-grid">
        {[
          { label: 'Products', value: stats.products, color: '#3FA34D', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
          { label: 'Categories', value: stats.categories, color: '#15140F', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
          { label: "Today's Orders", value: stats.today_orders, color: '#D69A35', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
          { label: 'Revenue', value: `₹${Math.round(stats.revenue)}`, color: '#15140F', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Pending', value: stats.pending_orders, color: '#15140F', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Low Stock', value: stats.low_stock_alerts?.length || 0, color: stats.low_stock_alerts?.length > 0 ? '#15140F' : '#3FA34D', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
        ].map(s => (
          <div className="stat-card" key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/[^a-z]/g, '-')}`}>
            <div className="stat-icon" style={{ background: `${s.color}12` }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={s.icon}/></svg>
            </div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* PR-2: Compliance expiring (30 days) */}
      {expiring.length > 0 && (
        <div className="card" data-testid="compliance-expiring-card" style={{ marginBottom: 24, padding: 16, background: '#FFF8E6', border: '1px solid #F2D98C' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: '#7A5A00' }}>
            ⚠ Compliance expiring (30 days)
          </h2>
          <div style={{ display: 'grid', gap: 6 }}>
            {expiring.map((e: any) => (
              <div key={e.store_id} data-testid={`compliance-row-${e.store_id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#7A5A00' }}>
                <strong>{e.name}</strong>
                <span>
                  {e.gst_days_remaining !== null && e.gst_days_remaining <= 30 && <span style={{ marginRight: 10 }}>GST: {e.gst_days_remaining < 0 ? 'expired' : `${e.gst_days_remaining}d`}</span>}
                  {e.fssai_days_remaining !== null && e.fssai_days_remaining <= 30 && <span>FSSAI: {e.fssai_days_remaining < 0 ? 'expired' : `${e.fssai_days_remaining}d`}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Low Stock Alerts */}
      {stats.low_stock_alerts?.length > 0 && (
        <div style={{ marginBottom: 24 }} data-testid="low-stock-section">
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: '#15140F' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#15140F" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            Low Stock Alerts
          </h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.low_stock_alerts.map((item: any) => (
              <div key={item.id} style={{ background: '#F1E7E1', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <strong>{item.name}</strong>: {Math.round(item.available_qty_grams)}g left
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Quick Actions</h2>
      <div className="quick-actions" data-testid="quick-actions">
        {[
          { to: '/admin/categories', title: 'Manage Categories', desc: 'Icons, fonts, ordering', color: '#15140F', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
          { to: '/admin/products', title: 'Manage Products', desc: 'Meals & single items', color: '#3FA34D', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
          { to: '/admin/orders', title: 'Orders', desc: 'All orders & history', color: '#D69A35', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2' },
          { to: '/admin/kitchen', title: 'Kitchen Monitor', desc: 'Live kitchen view', color: '#15140F', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
        ].map(a => (
          <Link to={a.to} className="action-card" key={a.to} data-testid={`goto-${a.title.toLowerCase().replace(/ /g, '-')}`}>
            <div className="action-icon" style={{ background: `${a.color}12` }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={a.icon}/></svg>
            </div>
            <div>
              <div className="action-title">{a.title}</div>
              <div className="action-desc">{a.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Staff Accounts (Kitchen & Cashier only) */}
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 12px' }}>Staff Accounts</h2>
      <table className="data-table" data-testid="staff-table">
        <thead><tr><th>Name</th><th>Role</th><th>PIN</th><th>Action</th></tr></thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.id}>
              <td style={{ fontWeight: 600 }}>{s.name}</td>
              <td><span className={`badge ${s.role === 'kitchen' ? 'badge-green' : 'badge-purple'}`}>{s.role}</span></td>
              <td style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{s.pin || '****'}</td>
              <td>
                {resetPinId === s.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      value={newPin}
                      onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="New PIN"
                      maxLength={6}
                      style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid #E0E0E0', fontSize: 13 }}
                      data-testid={`pin-input-${s.id}`}
                    />
                    <button className="btn btn-sm btn-green" onClick={resetPin} data-testid={`save-pin-${s.id}`}>Save</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setResetPinId(''); setNewPin(''); }}>Cancel</button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-secondary" onClick={() => setResetPinId(s.id)} data-testid={`reset-pin-${s.id}`}>Reset PIN</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
