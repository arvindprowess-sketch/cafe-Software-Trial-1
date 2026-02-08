import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const STATUS_COLORS: Record<string, string> = { pending: 'badge-orange', preparing: 'badge-purple', ready: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red' };

export default function CashierOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [heldBills, setHeldBills] = useState<any[]>([]);
  const [showReceipt, setShowReceipt] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'held'>('orders');

  const load = async () => {
    try {
      const [o, h] = await Promise.all([api('/orders'), api('/held-bills')]);
      setOrders(o);
      setHeldBills(h);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const viewReceipt = async (orderId: string) => {
    try { setShowReceipt(await api(`/orders/${orderId}/receipt`)); } catch (err: any) { alert(err.message); }
  };

  const printReceipt = () => {
    const el = document.getElementById('receipt-content');
    if (!el) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Receipt</title><style>body{font-family:monospace;padding:16px;font-size:13px;max-width:300px;margin:0 auto}h2{text-align:center;margin:0}.dashed{border-top:1px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between}.big{font-size:16px;font-weight:bold}</style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const resumeHeldBill = (bill: any) => {
    // Navigate to POS with the held bill data in URL params
    const data = encodeURIComponent(JSON.stringify(bill));
    window.location.href = `/cashier?resume=${data}`;
  };

  const discardHeldBill = async (billId: string) => {
    if (!confirm('Discard this held bill?')) return;
    try { await api(`/held-bills/${billId}`, { method: 'DELETE' }); load(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Orders</h1><p>{orders.length} orders · {heldBills.length} held</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${activeTab === 'orders' ? 'btn-purple' : 'btn-secondary'}`} onClick={() => setActiveTab('orders')} data-testid="tab-orders">Orders ({orders.length})</button>
          <button className={`btn btn-sm ${activeTab === 'held' ? 'btn-orange' : 'btn-secondary'}`} onClick={() => setActiveTab('held')} data-testid="tab-held">
            Hold ({heldBills.length})
            {heldBills.length > 0 && <span style={{ background: '#FF9F0A', color: '#fff', borderRadius: '50%', padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{heldBills.length}</span>}
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
              <h3>No held bills</h3>
              <p>Bills put on hold from POS will appear here</p>
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
                  {bill.coupon_code && <div style={{ fontSize: 12, color: '#267E3E', marginBottom: 8 }}>Coupon: {bill.coupon_code} (-₹{bill.coupon_discount})</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-green" style={{ flex: 2 }} onClick={() => resumeHeldBill(bill)} data-testid={`resume-${bill.id}`}>
                      Resume Order
                    </button>
                    <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => discardHeldBill(bill.id)} data-testid={`discard-${bill.id}`}>
                      Discard
                    </button>
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
          {orders.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 7h8M8 11h6M8 15h4"/></svg></div>
              <h3>No orders yet</h3>
            </div>
          )}
          <table className="data-table">
            <thead><tr><th>Order #</th><th>Customer</th><th>Type</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Time</th><th>Actions</th></tr></thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 800 }}>#{o.id}</td>
                  <td>{o.customer_name || o.user_name}</td>
                  <td><span className="badge badge-purple">{o.order_type}</span></td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.items?.map((i: any) => i.product_name).join(', ')}</td>
                  <td style={{ fontWeight: 700 }}>₹{Math.round(o.total_price)}</td>
                  <td><span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: 12 }}>{o.payment_mode || 'cash'}</span></td>
                  <td><span className={`badge ${STATUS_COLORS[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                  <td style={{ fontSize: 12, color: '#9C9C9C' }}>{new Date(o.created_at).toLocaleString()}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => viewReceipt(o.id)} data-testid={`receipt-${o.id}`}>Receipt</button>
                  </td>
                </tr>
              ))}
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
