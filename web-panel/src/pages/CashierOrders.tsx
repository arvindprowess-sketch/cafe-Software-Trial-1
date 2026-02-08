import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const STATUS_COLORS: Record<string, string> = { pending: 'badge-orange', preparing: 'badge-purple', ready: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red' };
const PAYMENT_COLORS: Record<string, string> = { paid: '#267E3E', unpaid: '#E23744', pending: '#FF9F0A' };

export default function CashierOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showReceipt, setShowReceipt] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'held'>('orders');
  const [filter, setFilter] = useState('all'); // all, app, walk_in

  const load = async () => {
    try {
      const [o, h] = await Promise.all([api('/orders'), api('/held-bills')]);
      setOrders(o);
      setHeldBills(h);
    } catch {}
  };
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv); }, []);

  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.order_source === filter);

  const viewReceipt = async (orderId: string) => {
    try { setShowReceipt(await api(`/orders/${orderId}/receipt`)); } catch (err: any) { alert(err.message); }
  };

  const printReceipt = () => {
    const el = document.getElementById('receipt-content');
    if (!el) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Receipt</title><style>body{font-family:monospace;padding:16px;font-size:13px;max-width:300px;margin:0 auto}h2{text-align:center;margin:0}.dashed{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between}</style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const resumeHeldBill = (bill: any) => {
    const data = encodeURIComponent(JSON.stringify(bill));
    window.location.href = `/cashier?resume=${data}`;
  };

  const discardHeldBill = async (billId: string) => {
    if (!confirm('Discard this held bill?')) return;
    try { await api(`/held-bills/${billId}`, { method: 'DELETE' }); load(); } catch (err: any) { alert(err.message); }
  };

  const appOrders = orders.filter(o => o.order_source === 'app');
  const walkInOrders = orders.filter(o => o.order_source !== 'app');
  const pendingCount = orders.filter(o => ['pending', 'preparing'].includes(o.status)).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p>{orders.length} total · {pendingCount} active · {heldBills.length} held</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${activeTab === 'orders' ? 'btn-purple' : 'btn-secondary'}`} onClick={() => setActiveTab('orders')} data-testid="tab-orders">
            Orders ({orders.length})
          </button>
          <button className={`btn btn-sm ${activeTab === 'held' ? 'btn-orange' : 'btn-secondary'}`} onClick={() => setActiveTab('held')} data-testid="tab-held">
            Hold {heldBills.length > 0 && <span style={{ background: '#FF9F0A', color: '#fff', borderRadius: '50%', padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{heldBills.length}</span>}
          </button>
          <button className="btn btn-secondary" onClick={load} data-testid="refresh-orders-btn">Refresh</button>
        </div>
      </div>

      {/* Held Bills Tab */}
      {activeTab === 'held' && (
        <>
          {heldBills.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M10 15V9l5 3-5 3z"/></svg></div>
              <h3>No held bills</h3><p>Bills on hold from POS appear here</p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {heldBills.map(bill => {
              const billTotal = bill.items?.reduce((a: number, i: any) => a + (i.price || 0), 0) || 0;
              return (
                <div key={bill.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '2px solid #FF9F0A', borderLeft: '6px solid #FF9F0A' }} data-testid={`held-bill-${bill.id}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{bill.customer_name || 'Walk-in'}</div>
                      <div style={{ fontSize: 12, color: '#9C9C9C' }}>{bill.order_type} · {new Date(bill.created_at).toLocaleString()}</div>
                    </div>
                    <span className="badge badge-orange">HELD</span>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    {bill.items?.map((item: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                        <span>{item.name} ({item.product_type === 'ready_made' ? `x${item.plateQty || 1}` : `${item.grams}g`})</span>
                        <span style={{ fontWeight: 600 }}>₹{Math.round(item.price)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, borderTop: '1px solid #EFEFEF', paddingTop: 8, marginBottom: 10 }}>
                    <span>Total</span><span>₹{Math.round(billTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-green" style={{ flex: 2 }} onClick={() => resumeHeldBill(bill)} data-testid={`resume-${bill.id}`}>Resume</button>
                    <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => discardHeldBill(bill.id)} data-testid={`discard-${bill.id}`}>Discard</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <>
          {/* Source filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'all', label: `All (${orders.length})` },
              { key: 'app', label: `App Orders (${appOrders.length})` },
              { key: 'walk_in', label: `Walk-in (${walkInOrders.length})` },
            ].map(f => (
              <button key={f.key} className={`btn btn-sm ${filter === f.key ? 'btn-purple' : 'btn-secondary'}`}
                onClick={() => setFilter(f.key)} data-testid={`filter-${f.key}`}>{f.label}</button>
            ))}
          </div>

          {filteredOrders.length === 0 && (
            <div className="empty-state"><h3>No orders</h3></div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Order #</th><th>Source</th><th>Customer</th><th>Type</th><th>Items</th>
                <th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(o => {
                const isApp = o.order_source === 'app';
                return (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 800 }}>#{o.id}</td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                        background: isApp ? '#5B5FE015' : '#FF9F0A15',
                        color: isApp ? '#5B5FE0' : '#FF9F0A',
                      }}>
                        {isApp ? 'APP' : 'WALK-IN'}
                      </span>
                    </td>
                    <td>{o.customer_name || o.user_name}</td>
                    <td><span className="badge badge-purple">{o.order_type}</span></td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.items?.map((i: any) => i.product_name).join(', ')}
                    </td>
                    <td style={{ fontWeight: 700 }}>₹{Math.round(o.total_price)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 11 }}>{o.payment_mode || 'cash'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: PAYMENT_COLORS[o.payment_status] || '#9C9C9C' }}>
                          {o.payment_status === 'paid' ? 'PAID' : 'PENDING'}
                        </span>
                      </div>
                    </td>
                    <td><span className={`badge ${STATUS_COLORS[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                    <td style={{ fontSize: 12, color: '#9C9C9C' }}>{new Date(o.created_at).toLocaleString()}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => viewReceipt(o.id)} data-testid={`receipt-${o.id}`}>Receipt</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Receipt Modal */}
      {showReceipt && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReceipt(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2>Receipt</h2>
            <div id="receipt-content" style={{ fontFamily: 'monospace', fontSize: 13 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 18 }}>DIET CAFE</h2></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Order #</span><strong>{showReceipt.order_id}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Customer</span><span>{showReceipt.customer_name}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Payment</span><span style={{ fontWeight: 700, textTransform: 'uppercase' }}>{showReceipt.payment_mode}</span></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              {showReceipt.items?.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{item.name} ({item.quantity})</span><span>₹{Math.round(item.price)}</span></div>
              ))}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>Base</span><span>₹{showReceipt.base_amount}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9C9C9C' }}><span>GST 5%</span><span>₹{showReceipt.gst_amount}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '1px dashed #000', paddingTop: 6, marginTop: 6 }}><span>TOTAL</span><span>₹{Math.round(showReceipt.total)}</span></div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReceipt(null)}>Close</button>
              <button className="btn btn-purple" onClick={printReceipt} data-testid="print-receipt-btn">Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
