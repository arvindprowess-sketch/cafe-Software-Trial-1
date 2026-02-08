import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const STATUS_COLORS: Record<string, string> = { pending: 'badge-orange', preparing: 'badge-purple', ready: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red' };

export default function CashierOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [showReceipt, setShowReceipt] = useState<any>(null);

  const load = async () => { try { setOrders(await api('/orders')); } catch {} };
  useEffect(() => { load(); }, []);

  const viewReceipt = async (orderId: string) => {
    try {
      const receipt = await api(`/orders/${orderId}/receipt`);
      setShowReceipt(receipt);
    } catch (err: any) { alert(err.message); }
  };

  const printReceipt = () => {
    const el = document.getElementById('receipt-content');
    if (!el) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Receipt #${showReceipt?.order_id}</title>
      <style>body{font-family:monospace;padding:16px;font-size:13px;max-width:300px;margin:0 auto}
      h2{text-align:center;margin:0}.line{border-top:1px dashed #000;margin:8px 0}
      .row{display:flex;justify-content:space-between}.center{text-align:center}
      .bold{font-weight:bold}.total{font-size:16px;font-weight:bold}</style></head><body>`);
    w.document.write(el.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Recent Orders</h1><p>{orders.length} orders</p></div>
        <button className="btn btn-secondary" onClick={load} data-testid="refresh-orders-btn">Refresh</button>
      </div>
      {orders.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 7h8M8 11h6M8 15h4"/></svg></div>
          <h3>No orders yet</h3>
          <p>Orders placed from POS will appear here</p>
        </div>
      )}
      <table className="data-table">
        <thead><tr><th>Order #</th><th>Type</th><th>Items</th><th>Total</th><th>Calories</th><th>Status</th><th>Time</th><th>Actions</th></tr></thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.id}>
              <td style={{ fontWeight: 800 }}>#{o.id}</td>
              <td><span className="badge badge-purple">{o.order_type}</span></td>
              <td>{o.items?.map((i: any) => i.product_name).join(', ')}</td>
              <td style={{ fontWeight: 700 }}>₹{Math.round(o.total_price)}</td>
              <td>{Math.round(o.total_calories)} cal</td>
              <td><span className={`badge ${STATUS_COLORS[o.status] || 'badge-gray'}`}>{o.status}</span></td>
              <td style={{ fontSize: 12, color: '#9C9C9C' }}>{new Date(o.created_at).toLocaleString()}</td>
              <td>
                <button className="btn btn-sm btn-secondary" onClick={() => viewReceipt(o.id)} data-testid={`receipt-${o.id}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 7h8M8 11h6"/></svg>
                  Receipt
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showReceipt && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowReceipt(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <h2>Order Receipt</h2>
            <div id="receipt-content" style={{ fontFamily: 'monospace', fontSize: 13 }}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>DIET CAFE</h2>
                <p style={{ margin: 0, fontSize: 11, color: '#9C9C9C' }}>{showReceipt.cafe_tagline}</p>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Order #</span><strong>{showReceipt.order_id}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Type</span><span>{showReceipt.order_type}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Customer</span><span>{showReceipt.customer_name}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Date</span><span>{new Date(showReceipt.date).toLocaleString()}</span></div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              {showReceipt.items?.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span>{item.name} ({item.quantity})</span>
                  <span>₹{Math.round(item.price)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>₹{Math.round(showReceipt.subtotal)}</span></div>
              {showReceipt.extra_charge > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{showReceipt.extra_charge_label}</span><span>₹{showReceipt.extra_charge}</span></div>}
              {showReceipt.discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#267E3E' }}><span>Discount</span><span>-₹{showReceipt.discount}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 16, borderTop: '1px dashed #000', paddingTop: 6, marginTop: 6 }}>
                <span>TOTAL</span><span>₹{Math.round(showReceipt.total)}</span>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <div style={{ fontSize: 11, color: '#9C9C9C' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Calories</span><span>{Math.round(showReceipt.nutrition_summary?.calories || 0)} kcal</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Protein</span><span>{Math.round(showReceipt.nutrition_summary?.protein || 0)}g</span></div>
              </div>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9C9C9C' }}>Payment: {showReceipt.payment_status}</p>
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9C9C9C' }}>Thank you for choosing Diet Cafe!</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReceipt(null)}>Close</button>
              <button className="btn btn-purple" onClick={printReceipt} data-testid="print-receipt-btn">Print Receipt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
