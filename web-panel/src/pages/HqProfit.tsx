import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';

// Margin health → existing badge classes (no new colors).
function marginBadge(pct: number) {
  if (pct >= 50) return 'badge-green';
  if (pct >= 30) return 'badge-orange';
  return 'badge-red';
}

type SortKey = 'margin_percentage' | 'profit_per_100g' | 'selling_price';

export default function HqProfit() {
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('margin_percentage');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    (async () => {
      try {
        const res = await api('/admin/profit-calculator');
        setRows(res.products || []);
        setSummary(res.summary || null);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => (a[sortKey] - b[sortKey]) * (sortDir === 'desc' ? -1 : 1));
    return arr;
  }, [rows, sortKey, sortDir]);

  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Profit Margins</h1>
          <p>Estimated per-100g margins{summary ? ` · avg ${summary.avg_margin}%` : ''}</p>
        </div>
      </div>

      <div style={{ background: '#F5ECD9', color: '#8A6D1B', border: '1px solid #E6D9B0', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 16 }}>
        Cost prices are <strong>server-side estimates</strong>, not actual purchase costs — use margins as a directional guide only.
      </div>

      {loading ? (
        <p style={{ color: '#9C9C9C', padding: 20 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#9C9C9C', padding: 40, textAlign: 'center' }}>No products to analyse.</p>
      ) : (
        <table className="data-table" data-testid="profit-table">
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('selling_price')}>Selling / 100g{arrow('selling_price')}</th>
              <th>Est. cost / 100g</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('profit_per_100g')}>Profit / 100g{arrow('profit_per_100g')}</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('margin_percentage')} data-testid="profit-sort-margin">Margin %{arrow('margin_percentage')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.product_id} data-testid={`profit-row-${r.product_id}`}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td>₹{r.selling_price}</td>
                <td style={{ color: '#9C9C9C' }}>~₹{r.estimated_cost}</td>
                <td style={{ fontWeight: 700 }}>₹{r.profit_per_100g}</td>
                <td><span className={`badge ${marginBadge(r.margin_percentage)}`}>{r.margin_percentage}%</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
