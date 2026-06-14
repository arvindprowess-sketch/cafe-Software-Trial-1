import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

// ── HQ Command Center — Strip 2 Store Health Grid ──
type StoreHealth = {
  store_id: string; name: string; revenue_today: number; sales_delta_pct: number | null;
  stock_out_count: number; pending_approvals: number; day_opened: boolean;
  health: 'bad' | 'warn' | 'ok' | 'closed'; flags: string[];
};
const HEALTH_COLOR: Record<StoreHealth['health'], string> = {
  bad: 'var(--error)', warn: 'var(--warning)', ok: 'var(--success)', closed: 'var(--muted)',
};
const slug = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── HQ Command Center — Strip 3 Exception Feed ──
type Exception = {
  id: string; severity: 1 | 2 | 3; type: string; title: string; detail: string;
  store_id: string | null; action: 'review' | 'assign' | 'open'; deeplink: string;
};
const SEV_COLOR: Record<number, string> = { 3: 'var(--error)', 2: 'var(--warning)', 1: 'var(--muted)' };
const ACTION_LABEL: Record<Exception['action'], string> = { review: 'Review', assign: 'Assign', open: 'Open' };

// ── HQ Command Center — Strip 4 Intelligence (6 tabs) ──
type IntelRange = 'today' | 'week' | 'month';
const INTEL_TABS = [
  { key: 'product', label: 'Product' }, { key: 'build', label: 'Build-Your-Meal' },
  { key: 'goals', label: 'Goals' }, { key: 'customer', label: 'Customer' },
  { key: 'ratings', label: 'Ratings' }, { key: 'ai', label: 'AI Usage' },
] as const;
const MACRO_COLORS = ['#E2603F', '#D69A35', '#5E97B8']; // protein / carbs / fat
const prettyGoal = (g: string) => (g || 'unset').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const rangeFrom = (r: IntelRange) => {
  const d = new Date(); const days = r === 'today' ? 0 : r === 'week' ? 6 : 29;
  d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10);
};
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  );
}
function Row({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <span style={{ width: 150, fontSize: 13, color: 'var(--ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <Bar pct={pct} color={color} />
      <span style={{ width: 90, textAlign: 'right', fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function IntelStrip({ range }: { range: IntelRange }) {
  const [tab, setTab] = useState<typeof INTEL_TABS[number]['key']>('product');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (tab === 'ai') { setData(null); setError(''); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError(''); setData(null);
      try {
        let res;
        if (tab === 'product') res = await api(`/reports/items?from=${rangeFrom(range)}`);
        else if (tab === 'build') res = await api(`/hq/intel/ingredients?range=${range}`);
        else if (tab === 'goals') res = await api(`/hq/intel/goals?range=${range}`);
        else if (tab === 'customer') res = await api(`/hq/intel/customers?range=${range}`);
        else res = await api(`/hq/intel/ratings?range=${range}`);
        if (!cancelled) setData(res);
      } catch (e: any) { if (!cancelled) setError(e?.message || 'Failed'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tab, range, nonce]);

  const empty = (msg: string) => <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24, fontWeight: 600 }}>{msg}</div>;

  const renderTab = () => {
    if (tab === 'ai') return (
      <div data-testid="intel-ai-empty" style={{ textAlign: 'center', color: 'var(--muted)', padding: 28 }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🤖</div>
        <strong style={{ color: 'var(--ink)' }}>AI usage tracking not enabled yet</strong>
        <div style={{ fontSize: 12.5, marginTop: 6 }}>TODO: instrument ai_pick / combo_builder events, then surface real counts here.</div>
      </div>
    );
    if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;
    if (error) return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <span style={{ color: 'var(--error)', fontWeight: 600 }}>Couldn't load. </span>
        <button onClick={() => setNonce((n) => n + 1)} style={{ marginLeft: 8, padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: 'none', background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
      </div>
    );
    if (!data) return null;

    if (tab === 'product') {
      const items: any[] = data.items || [];
      if (items.length === 0) return empty('No sales in this range.');
      const maxRev = Math.max(...items.map((i) => i.revenue), 1);
      const top = items.slice(0, 6);
      const bottom = items.filter((i) => i.qty > 0).slice(-6).reverse();
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          <div><h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Top sellers</h4>
            {top.map((i) => <Row key={i.product_id} label={i.name} value={`₹${Math.round(i.revenue).toLocaleString('en-IN')}`} pct={i.revenue / maxRev * 100} color="var(--success)" />)}</div>
          <div><h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Bottom sellers</h4>
            {bottom.map((i) => <Row key={i.product_id} label={i.name} value={`₹${Math.round(i.revenue).toLocaleString('en-IN')}`} pct={i.revenue / maxRev * 100} color="var(--warning)" />)}</div>
        </div>
      );
    }
    if (tab === 'build') {
      const groups = data.groups || {};
      const keys = Object.keys(groups);
      if (keys.length === 0 || (data.customized_orders || 0) === 0) return empty('No Build-Your-Meal customizations in this range.');
      const ORDER = ['Protein', 'Base', 'Sauce', 'Veggies', 'Toppings', 'Other'];
      const sortedKeys = [...ORDER.filter((k) => groups[k]), ...keys.filter((k) => !ORDER.includes(k))];
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 28 }}>
          {sortedKeys.map((k) => (
            <div key={k}><h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{k}</h4>
              {groups[k].map((it: any) => <Row key={it.name} label={it.name} value={`${it.pct}% · ${it.count}`} pct={it.pct} color="var(--lime-deep)" />)}</div>
          ))}
        </div>
      );
    }
    if (tab === 'goals') {
      const dist: any[] = data.distribution || [];
      if (dist.length === 0) return empty('No orders with a goal in this range.');
      return (
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
            Revenue this period: <strong style={{ color: 'var(--ink)' }}>₹{Math.round(data.revenue_total || 0).toLocaleString('en-IN')}</strong>{' '}
            <Delta pct={data.revenue_delta_pct} suffix="vs prev period" />
          </div>
          {dist.map((g, i) => (
            <Row key={g.goal} label={prettyGoal(g.goal)} value={`${g.pct}% · ₹${Math.round(g.revenue).toLocaleString('en-IN')}`} pct={g.pct} color={MACRO_COLORS[i % MACRO_COLORS.length]} />
          ))}
        </div>
      );
    }
    if (tab === 'customer') {
      const o = data.overall || { new: 0, repeat: 0, new_pct: 0, repeat_pct: 0, repeat_rate: 0 };
      if ((o.new + o.repeat) === 0) return empty('No customers in this range.');
      return (
        <div>
          <Row label="New customers" value={`${o.new_pct}% · ${o.new}`} pct={o.new_pct} color="var(--lime-deep)" />
          <Row label="Repeat customers" value={`${o.repeat_pct}% · ${o.repeat}`} pct={o.repeat_pct} color="var(--success)" />
          <h4 style={{ margin: '18px 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Repeat rate by store</h4>
          {(data.by_store || []).map((s: any) => <Row key={s.store_id} label={s.name} value={`${s.repeat_rate}% (${s.customers})`} pct={s.repeat_rate} color="var(--success)" />)}
        </div>
      );
    }
    // ratings
    const byStore: any[] = data.by_store || [];
    if (byStore.length === 0) return empty('No ratings in this range.');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div><h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Avg rating by store</h4>
          {byStore.map((s) => <Row key={s.store_id} label={s.name} value={`★ ${s.avg_rating} (${s.rated_orders})`} pct={s.avg_rating / 5 * 100} color="var(--warning)" />)}</div>
        <div><h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Lowest-rated items</h4>
          {(data.lowest_items || []).length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Not enough rated items yet.</div>
            : data.lowest_items.map((it: any) => <Row key={it.product_id} label={it.name} value={`★ ${it.avg_rating} (${it.n})`} pct={it.avg_rating / 5 * 100} color="var(--error)" />)}</div>
      </div>
    );
  };

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '28px 0 12px' }}>Intelligence</h2>
      <div className="stat-card" data-testid="intel-strip" style={{ padding: 0, marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', padding: 8, flexWrap: 'wrap' }}>
          {INTEL_TABS.map((t) => (
            <button
              key={t.key}
              data-testid={`intel-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              style={{ padding: '8px 14px', borderRadius: 'var(--radius-pill)', border: 'none', background: tab === t.key ? 'var(--ink)' : 'transparent', color: tab === t.key ? 'var(--white)' : 'var(--muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >{t.label}</button>
          ))}
        </div>
        <div style={{ padding: 18 }}>{renderTab()}</div>
      </div>
    </>
  );
}

// ── HQ Command Center — Strip 5 Security Center ──
type SecEvent = { type: string; summary: string; actor: string; store_id: string | null; severity: number; ts: string };
const SEC_META: Record<string, { icon: string; label: string }> = {
  price_change: { icon: '₹', label: 'Price change' },
  role_change: { icon: '🛡', label: 'Role change' },
  after_hours_activity: { icon: '🌙', label: 'After hours' },
  rejected_discard: { icon: '⊘', label: 'Rejected discard' },
  manual_stock_adjust: { icon: '📦', label: 'Stock adjust' },
};
const SEC_SEV_BG: Record<number, string> = { 3: '#C0392B22', 2: '#D69A3522', 1: '#6B6A5E18' };
const SEC_SEV_FG: Record<number, string> = { 3: 'var(--error)', 2: 'var(--warning)', 1: 'var(--muted)' };
const relTime = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!iso || isNaN(s)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function SecurityStrip({ range }: { range: IntelRange }) {
  const [feed, setFeed] = useState<SecEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setFeed(await api(`/hq/security-feed?range=${range}`)); }
    catch (e: any) { setError(e?.message || 'Failed'); }
    finally { setLoading(false); }
  }, [range]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '28px 0 12px' }}>Security Center</h2>
      {loading ? (
        <div data-testid="security-feed" style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          {[0, 1].map((i) => <div key={i} className="stat-card" style={{ height: 56, background: 'var(--border)', opacity: 0.5 }} />)}
        </div>
      ) : error ? (
        <div className="stat-card" style={{ textAlign: 'center', padding: 24, marginBottom: 28 }}>
          <span style={{ color: 'var(--error)', fontWeight: 600 }}>Couldn't load security feed. </span>
          <button onClick={load} style={{ marginLeft: 8, padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: 'none', background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : feed && feed.length > 0 ? (
        <div data-testid="security-feed" style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          {feed.map((e, i) => {
            const meta = SEC_META[e.type] || { icon: '•', label: e.type };
            return (
              <div key={`${e.type}-${i}`} data-testid={`sec-${e.type}-${i}`} className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', textAlign: 'left' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: SEC_SEV_BG[e.severity] || 'var(--border)', color: SEC_SEV_FG[e.severity], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{meta.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: SEC_SEV_FG[e.severity] }}>{meta.label}</span>
                    <strong style={{ fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.summary}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{e.actor}{e.store_id ? ` · ${e.store_id}` : ''}</div>
                </div>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{relTime(e.ts)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div data-testid="security-feed" className="stat-card" style={{ textAlign: 'center', padding: 28, marginBottom: 28, color: 'var(--muted)', fontWeight: 600 }}>No flagged activity in this range.</div>
      )}
    </>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
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

  // Strip 2 — Store Health Grid
  const [health, setHealth] = useState<StoreHealth[] | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState('');
  const loadHealth = useCallback(async () => {
    setHealthLoading(true); setHealthError('');
    try { setHealth(await api('/hq/store-health')); }
    catch (e: any) { setHealthError(e?.message || 'Failed'); }
    finally { setHealthLoading(false); }
  }, []);
  useEffect(() => { loadHealth(); }, [loadHealth]);

  // Strip 3 — Exception Feed
  const [exceptions, setExceptions] = useState<Exception[] | null>(null);
  const [excLoading, setExcLoading] = useState(true);
  const [excError, setExcError] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set()); // session-local hide, no backend
  const loadExceptions = useCallback(async () => {
    setExcLoading(true); setExcError('');
    try { setExceptions(await api('/hq/exceptions')); }
    catch (e: any) { setExcError(e?.message || 'Failed'); }
    finally { setExcLoading(false); }
  }, []);
  useEffect(() => { loadExceptions(); }, [loadExceptions]);

  useRealtime(['hq'], (msg) => {
    if (['new_order', 'order_status', 'business_day'].includes(msg.type)) { loadPulse(); loadHealth(); loadExceptions(); }
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

      {/* HQ Command Center — Strip 2 Store Health Grid (worst-first) */}
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '28px 0 12px' }}>Store Health</h2>
      {healthLoading ? (
        <div className="stats-grid" data-testid="store-health-grid">
          {[0, 1, 2].map((i) => <div key={i} className="stat-card" style={{ height: 110, background: 'var(--border)', opacity: 0.5 }} />)}
        </div>
      ) : healthError ? (
        <div className="stat-card" style={{ textAlign: 'center', padding: 28, marginBottom: 28 }}>
          <p style={{ color: 'var(--error)', fontWeight: 600, marginBottom: 12 }}>Couldn't load store health.</p>
          <button onClick={loadHealth} style={{ padding: '10px 20px', borderRadius: 'var(--radius-pill)', border: 'none', background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : health && health.length > 0 ? (
        <div className="stats-grid" data-testid="store-health-grid" style={{ marginBottom: 28 }}>
          {health.map((s) => (
            <div
              key={s.store_id}
              data-testid={`store-tile-${slug(s.name) || s.store_id}`}
              className="stat-card"
              onClick={() => navigate(`/hq/store-dashboard?store=${encodeURIComponent(s.store_id)}`)}
              style={{ cursor: 'pointer', borderLeft: `4px solid ${HEALTH_COLOR[s.health]}`, textAlign: 'left', alignItems: 'stretch' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 15, color: 'var(--ink)' }}>{s.name}</strong>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: HEALTH_COLOR[s.health] }}>{s.health}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--font-brand)', fontSize: 22, color: 'var(--ink)' }}>{inr(s.revenue_today)}</span>
                <Delta pct={s.sales_delta_pct} suffix="vs 7d avg" />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {s.flags.map((f, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-pill)',
                    background: f === 'Healthy' ? '#3FA34D18' : f === 'Day not opened' ? '#6B6A5E18' : '#C0392B12',
                    color: f === 'Healthy' ? 'var(--success)' : f === 'Day not opened' ? 'var(--muted)' : 'var(--error)',
                  }}>{f}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="stat-card" style={{ textAlign: 'center', padding: 28, marginBottom: 28, color: 'var(--muted)', fontWeight: 600 }}>No stores yet</div>
      )}

      {/* HQ Command Center — Strip 3 Exception Feed (ranked anomalies, sev 3>2>1) */}
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '28px 0 12px' }}>Exceptions</h2>
      {excLoading ? (
        <div data-testid="exception-feed" style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          {[0, 1].map((i) => <div key={i} className="stat-card" style={{ height: 64, background: 'var(--border)', opacity: 0.5 }} />)}
        </div>
      ) : excError ? (
        <div className="stat-card" style={{ textAlign: 'center', padding: 28, marginBottom: 28 }}>
          <p style={{ color: 'var(--error)', fontWeight: 600, marginBottom: 12 }}>Couldn't load exceptions.</p>
          <button onClick={loadExceptions} style={{ padding: '10px 20px', borderRadius: 'var(--radius-pill)', border: 'none', background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      ) : (() => {
        const visible = (exceptions || []).filter((e) => !dismissed.has(e.id));
        if (visible.length === 0) {
          return <div data-testid="exception-feed" className="stat-card" style={{ textAlign: 'center', padding: 28, marginBottom: 28, color: 'var(--muted)', fontWeight: 600 }}>Nothing needs attention. All clear.</div>;
        }
        return (
          <div data-testid="exception-feed" style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
            {visible.map((e, i) => (
              <div
                key={e.id}
                data-testid={`exc-${e.id}`}
                className="stat-card"
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderLeft: `4px solid ${SEV_COLOR[e.severity]}`, textAlign: 'left' }}
              >
                <span style={{ fontFamily: 'var(--font-brand)', fontSize: 18, color: 'var(--muted)', minWidth: 22 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: SEV_COLOR[e.severity], textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sev {e.severity}</span>
                    <strong style={{ fontSize: 14, color: 'var(--ink)' }}>{e.title}</strong>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>{e.detail}</div>
                </div>
                <button
                  data-testid={`exc-action-${e.id}`}
                  onClick={() => navigate(e.deeplink)}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-pill)', border: 'none', background: 'var(--ink)', color: 'var(--white)', fontWeight: 700, fontSize: 12, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                >
                  {ACTION_LABEL[e.action]}
                </button>
                <button
                  data-testid={`exc-dismiss-${e.id}`}
                  onClick={() => setDismissed((prev) => new Set(prev).add(e.id))}
                  style={{ padding: '8px 14px', borderRadius: 'var(--radius-pill)', border: '1.5px solid var(--border)', background: 'var(--white)', color: 'var(--muted)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        );
      })()}

      {/* HQ Command Center — Strip 4 Intelligence (6 tabs) */}
      <IntelStrip range={range} />

      {/* HQ Command Center — Strip 5 Security Center */}
      <SecurityStrip range={range} />

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
