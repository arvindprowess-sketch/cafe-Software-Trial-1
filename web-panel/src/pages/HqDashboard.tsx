import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useRealtime } from '../utils/realtime';

// ============================================================================
// HQ Command Center — Strip 1 PULSE (Prompt 1).
// Live revenue / orders+AOV / active stores / critical alerts across all stores,
// with a Today/Week/Month switcher. Live query (no rollup). HQ-only (route + API
// guarded). Auto-refreshes on order / business_day realtime events (room 'hq').
// Health grid, exception feed, intelligence & security are later prompts.
// ============================================================================

type Pulse = {
  range: 'today' | 'week' | 'month';
  revenue: number;
  revenue_delta_pct: number | null;
  orders: number;
  aov: number;
  aov_delta_pct: number | null;
  active_stores: number;
  total_stores: number;
  stores_not_opened: { store_id: string; name: string }[];
  critical_alerts: number;
};

const RANGES: { key: Pulse['range']; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

function deltaSuffix(range: Pulse['range']) {
  if (range === 'today') return 'vs same weekday';
  if (range === 'week') return 'vs prev 7d';
  return 'vs prev 30d';
}

function Delta({ pct, suffix }: { pct: number | null; suffix: string }) {
  if (pct === null || pct === undefined) {
    return <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>— no baseline</span>;
  }
  const up = pct >= 0;
  return (
    <span style={{ color: up ? 'var(--success)' : 'var(--error)', fontSize: 12, fontWeight: 700 }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{suffix}</span>
    </span>
  );
}

export default function HqDashboard() {
  const [range, setRange] = useState<Pulse['range']>('today');
  const [data, setData] = useState<Pulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const d = await api(`/hq/pulse?range=${range}`);
      setData(d);
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh on HQ realtime activity (orders + business-day events).
  useRealtime(['hq'], (msg) => {
    if (['new_order', 'order_status', 'business_day'].includes(msg.type)) load();
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Command Center</h1>
          <p>Live pulse across all stores</p>
        </div>
        <div className="time-switcher" data-testid="time-switcher" style={{ display: 'flex', gap: 8 }}>
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-pill)',
                border: '1.5px solid ' + (range === r.key ? 'var(--ink)' : 'var(--border)'),
                background: range === r.key ? 'var(--ink)' : 'var(--white)',
                color: range === r.key ? 'var(--white)' : 'var(--muted)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="stats-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat-card" style={{ height: 120, background: 'var(--border)', opacity: 0.5 }} />
          ))}
        </div>
      ) : error ? (
        <div className="stat-card" style={{ textAlign: 'center', padding: 32 }}>
          <p style={{ color: 'var(--error)', fontWeight: 600, marginBottom: 12 }}>Couldn't load pulse.</p>
          <button
            onClick={load}
            style={{
              padding: '10px 20px', borderRadius: 'var(--radius-pill)', border: 'none',
              background: 'var(--lime)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <div className="stats-grid">
          {/* Revenue */}
          <div className="stat-card" data-testid="pulse-revenue">
            <div className="stat-icon" style={{ background: '#15140F15' }}>💰</div>
            <div className="stat-value">{inr(data.revenue)}</div>
            <div className="stat-label">Revenue</div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              <Delta pct={data.revenue_delta_pct} suffix={deltaSuffix(data.range)} />
            </div>
          </div>

          {/* Orders + AOV */}
          <div className="stat-card" data-testid="pulse-orders">
            <div className="stat-icon" style={{ background: '#A6D62E22' }}>🧾</div>
            <div className="stat-value">{data.orders}</div>
            <div className="stat-label">Orders</div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, fontWeight: 600 }}>
              AOV {inr(data.aov)} <Delta pct={data.aov_delta_pct} suffix={deltaSuffix(data.range)} />
            </div>
          </div>

          {/* Active Stores X/Y */}
          <div className="stat-card" data-testid="pulse-active-stores">
            <div className="stat-icon" style={{ background: '#5E97B822' }}>🏪</div>
            <div className="stat-value">{data.active_stores}/{data.total_stores}</div>
            <div className="stat-label">Active Stores</div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
              {data.stores_not_opened.length > 0
                ? `${data.stores_not_opened.length} not opened`
                : 'all open'}
            </div>
          </div>

          {/* Critical Alerts (red card) */}
          <div
            className="stat-card"
            data-testid="pulse-alerts"
            style={{
              background: data.critical_alerts > 0 ? '#C0392B' : 'var(--white)',
              borderColor: data.critical_alerts > 0 ? '#C0392B' : 'var(--border)',
            }}
          >
            <div className="stat-icon" style={{ background: data.critical_alerts > 0 ? '#ffffff22' : '#C0392B15' }}>⚠️</div>
            <div className="stat-value" style={{ color: data.critical_alerts > 0 ? 'var(--white)' : 'var(--ink)' }}>
              {data.critical_alerts}
            </div>
            <div className="stat-label" style={{ color: data.critical_alerts > 0 ? '#ffffffcc' : 'var(--muted)' }}>
              Critical Alerts
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
