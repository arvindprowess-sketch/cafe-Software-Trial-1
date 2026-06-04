import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function KitchenInventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [stockQty, setStockQty] = useState('');
  const [stockAction, setStockAction] = useState<'add' | 'remove'>('add');
  const [stockReason, setStockReason] = useState('');
  const [stockLogs, setStockLogs] = useState<any[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try {
      const data = await api('/inventory');
      const order: Record<string, number> = { out_of_stock: 0, low: 1, in_stock: 2 };
      data.sort((a: any, b: any) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
      setInventory(data);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const loadLogs = async () => {
    try { setStockLogs(await api('/inventory/stock-logs')); } catch {}
  };

  const counts = {
    total: inventory.length,
    inStock: inventory.filter(i => i.status === 'in_stock').length,
    low: inventory.filter(i => i.status === 'low').length,
    out: inventory.filter(i => i.status === 'out_of_stock').length
  };
  const colors: Record<string, string> = { in_stock: '#3FA34D', low: '#D69A35', out_of_stock: '#15140F' };
  const labels: Record<string, string> = { in_stock: 'In Stock', low: 'Low', out_of_stock: 'Out' };

  const openStockModal = (item: any, action: 'add' | 'remove') => {
    setSelectedItem(item);
    setStockAction(action);
    setStockQty('');
    setStockReason('');
    setShowStockModal(true);
  };

  const handleStockUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !stockQty) return;
    const qty = parseFloat(stockQty);
    if (isNaN(qty) || qty <= 0) return;
    try {
      await api('/inventory/update-stock', {
        method: 'POST',
        body: {
          product_id: selectedItem.id,
          quantity_grams: stockAction === 'add' ? qty : -qty,
          reason: stockReason || (stockAction === 'add' ? 'Stock replenished' : 'Stock removed')
        }
      });
      setShowStockModal(false);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filtered = filter === 'all' ? inventory : inventory.filter(i => i.status === filter);

  return (
    <div>
      <div className="page-header">
        <div><h1>Inventory</h1><p>{counts.total} items</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => { setShowLogs(true); loadLogs(); }} data-testid="stock-logs-btn">Stock Logs</button>
          <button className="btn btn-secondary" onClick={load} data-testid="refresh-inventory-btn">Refresh</button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card" onClick={() => setFilter('in_stock')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: '#3FA34D15' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3FA34D" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div className="stat-value" style={{ color: '#3FA34D' }}>{counts.inStock}</div>
          <div className="stat-label">In Stock</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('low')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: '#D69A3515' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D69A35" strokeWidth="2"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div className="stat-value" style={{ color: '#D69A35' }}>{counts.low}</div>
          <div className="stat-label">Low Stock</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('out_of_stock')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: '#15140F15' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15140F" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </div>
          <div className="stat-value" style={{ color: '#15140F' }}>{counts.out}</div>
          <div className="stat-label">Out of Stock</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('all')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon" style={{ background: '#15140F15' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15140F" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          </div>
          <div className="stat-value" style={{ color: '#15140F' }}>{counts.total}</div>
          <div className="stat-label">All Items</div>
        </div>
      </div>

      {filter !== 'all' && (
        <div style={{ marginBottom: 12 }}>
          <span className="badge badge-purple" style={{ fontSize: 13, padding: '6px 14px' }}>
            Showing: {labels[filter] || filter}
          </span>
          <button style={{ background: 'none', border: 'none', color: '#9C9C9C', marginLeft: 8, cursor: 'pointer', fontSize: 13 }} onClick={() => setFilter('all')}>Clear filter</button>
        </div>
      )}

      <div className="inventory-grid">
        {filtered.map(item => (
          <div className="inv-card" key={item.id} data-testid={`inv-item-${item.id}`}>
            <div className="inv-dot" style={{ background: colors[item.status] || '#9C9C9C' }} />
            <div className="inv-info">
              <div className="inv-name">{item.name}</div>
              <div className="inv-meta">{item.category} · {item.diet_type === 'non-veg' ? 'Non-Veg' : 'Veg'}</div>
            </div>
            <div className="inv-stock">
              <div className="inv-qty" style={{ color: colors[item.status] }}>
                {item.available_qty_grams >= 1000 ? `${(item.available_qty_grams / 1000).toFixed(1)}kg` : `${Math.round(item.available_qty_grams)}g`}
              </div>
              <span className={`badge ${item.status === 'in_stock' ? 'badge-green' : item.status === 'low' ? 'badge-orange' : 'badge-red'}`}>{labels[item.status]}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              <button className="btn btn-sm btn-green" onClick={() => openStockModal(item, 'add')} data-testid={`add-stock-${item.id}`} title="Add Stock">+</button>
              <button className="btn btn-sm btn-danger" onClick={() => openStockModal(item, 'remove')} data-testid={`remove-stock-${item.id}`} title="Remove Stock">-</button>
            </div>
          </div>
        ))}
      </div>

      {showStockModal && selectedItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowStockModal(false)}>
          <div className="modal">
            <h2>{stockAction === 'add' ? 'Add Stock' : 'Remove Stock'}: {selectedItem.name}</h2>
            <p style={{ color: '#9C9C9C', fontSize: 13, marginBottom: 16 }}>
              Current stock: {selectedItem.available_qty_grams >= 1000 ? `${(selectedItem.available_qty_grams / 1000).toFixed(1)}kg` : `${Math.round(selectedItem.available_qty_grams)}g`}
            </p>
            <form onSubmit={handleStockUpdate}>
              <div className="form-group">
                <label>Quantity (grams)</label>
                <input type="number" value={stockQty} onChange={e => setStockQty(e.target.value)} placeholder="e.g., 500" min="1" data-testid="stock-qty-input" required />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[100, 250, 500, 1000, 5000].map(q => (
                  <button type="button" key={q} className="btn btn-sm btn-secondary" onClick={() => setStockQty(String(q))} data-testid={`quick-qty-${q}`}>
                    {q >= 1000 ? `${q / 1000}kg` : `${q}g`}
                  </button>
                ))}
              </div>
              <div className="form-group">
                <label>Reason (optional)</label>
                <input value={stockReason} onChange={e => setStockReason(e.target.value)} placeholder="e.g., Morning delivery" data-testid="stock-reason-input" />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowStockModal(false)}>Cancel</button>
                <button type="submit" className={`btn ${stockAction === 'add' ? 'btn-green' : 'btn-primary'}`} data-testid="confirm-stock-btn">
                  {stockAction === 'add' ? 'Add Stock' : 'Remove Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLogs(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h2>Stock Change Logs</h2>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {stockLogs.length === 0 && <p style={{ color: '#9C9C9C', textAlign: 'center', padding: 20 }}>No stock changes yet</p>}
              {stockLogs.map((log: any) => (
                <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #EFEFEF' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{log.product_name}</div>
                    <div style={{ fontSize: 12, color: '#9C9C9C' }}>{log.reason} · by {log.user_name}</div>
                    <div style={{ fontSize: 11, color: '#9C9C9C' }}>{new Date(log.created_at).toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 800, color: log.change_grams > 0 ? '#3FA34D' : '#15140F', fontSize: 15 }}>
                      {log.change_grams > 0 ? '+' : ''}{log.change_grams >= 1000 ? `${(log.change_grams / 1000).toFixed(1)}kg` : `${log.change_grams}g`}
                    </span>
                    <div style={{ fontSize: 11, color: '#9C9C9C' }}>
                      Total: {log.new_total >= 1000 ? `${(log.new_total / 1000).toFixed(1)}kg` : `${Math.round(log.new_total)}g`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowLogs(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
