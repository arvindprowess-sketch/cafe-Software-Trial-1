import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';

export default function KitchenOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [showTicket, setShowTicket] = useState<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());

  // Create notification sound using Web Audio API
  const playAlertSound = useCallback((priority: string) => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (priority === 'urgent') {
        osc.frequency.value = 880;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2); gain2.connect(ctx.destination);
          osc2.frequency.value = 1100;
          gain2.gain.value = 0.3;
          osc2.start(); osc2.stop(ctx.currentTime + 0.15);
        }, 200);
        setTimeout(() => {
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();
          osc3.connect(gain3); gain3.connect(ctx.destination);
          osc3.frequency.value = 1320;
          gain3.gain.value = 0.3;
          osc3.start(); osc3.stop(ctx.currentTime + 0.2);
        }, 400);
      } else if (priority === 'high') {
        osc.frequency.value = 660;
        gain.gain.value = 0.2;
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2); gain2.connect(ctx.destination);
          osc2.frequency.value = 880;
          gain2.gain.value = 0.2;
          osc2.start(); osc2.stop(ctx.currentTime + 0.12);
        }, 180);
      } else {
        osc.frequency.value = 523;
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) { console.log('Audio not supported'); }
  }, [soundEnabled]);

  const load = async () => {
    try {
      const data = await api('/orders/kitchen');
      const pOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
      data.sort((a: any, b: any) => (pOrder[a.priority || 'normal'] ?? 2) - (pOrder[b.priority || 'normal'] ?? 2));

      // Check for new orders
      const currentIds = new Set(data.map((o: any) => o.id));
      const newOrders = data.filter((o: any) => !prevOrderIdsRef.current.has(o.id));
      if (newOrders.length > 0 && prevOrderIdsRef.current.size > 0) {
        // Play sound for highest priority new order
        const highestPriority = newOrders.reduce((acc: string, o: any) => {
          const p = o.priority || 'normal';
          if (p === 'urgent') return 'urgent';
          if (p === 'high' && acc !== 'urgent') return 'high';
          return acc;
        }, 'normal');
        playAlertSound(highestPriority);
      }
      prevOrderIdsRef.current = currentIds;
      setOrders(data);
    } catch {}
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 8000);
    return () => clearInterval(iv);
  }, []);

  const updateStatus = async (id: string, status: string) => {
    try { await api(`/orders/${id}/status?status=${status}`, { method: 'PUT' }); load(); } catch (e: any) { alert(e.message); }
  };

  const setPriority = async (id: string, priority: string) => {
    try {
      await api(`/orders/${id}/priority`, { method: 'PUT', body: { priority } });
      if (priority === 'urgent') playAlertSound('urgent');
      load();
    } catch (e: any) { alert(e.message); }
  };

  const printTicket = async (orderId: string) => {
    try {
      const ticket = await api(`/orders/${orderId}/kitchen-ticket`);
      setShowTicket(ticket);
    } catch (e: any) { alert(e.message); }
  };

  const handlePrint = () => {
    const printContent = document.getElementById('kitchen-ticket-print');
    if (!printContent) return;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Kitchen Ticket #${showTicket?.order_id}</title>
      <style>body{font-family:monospace;padding:16px;font-size:14px}h2{text-align:center;margin:0 0 8px}
      .line{border-top:1px dashed #000;margin:8px 0}.item{margin:4px 0}.bold{font-weight:bold}
      .center{text-align:center}.priority{text-transform:uppercase;font-weight:bold;text-align:center;padding:4px;margin:4px 0}
      .urgent{background:#fee;color:#c00}.high{background:#fff3e0;color:#e65100}</style></head><body>`);
    w.document.write(printContent.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.print();
  };

  const timeSince = (d: string) => {
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    return m < 1 ? 'Just now' : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1>Orders</h1><p>{orders.length} active</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={`btn btn-sm ${soundEnabled ? 'btn-green' : 'btn-secondary'}`}
            onClick={() => setSoundEnabled(!soundEnabled)}
            data-testid="toggle-sound-btn"
            title={soundEnabled ? 'Sound alerts ON' : 'Sound alerts OFF'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {soundEnabled ? (
                <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></>
              ) : (
                <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>
              )}
            </svg>
            {soundEnabled ? ' Sound ON' : ' Sound OFF'}
          </button>
          <button className="btn btn-secondary" onClick={load} data-testid="refresh-orders-btn">Refresh</button>
        </div>
      </div>

      {orders.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#267E3E" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h3>All caught up!</h3>
          <p>No pending orders right now</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 14 }}>
        {orders.map(o => {
          const p = o.priority || 'normal';
          return (
            <div className={`order-card ${p === 'urgent' ? 'urgent' : p === 'high' ? 'high' : ''}`} key={o.id} data-testid={`order-card-${o.id}`}>
              <div className="order-header">
                <span className="order-id">#{o.id}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${o.status === 'pending' ? 'badge-orange' : o.status === 'preparing' ? 'badge-purple' : 'badge-green'}`}>{o.status.toUpperCase()}</span>
                  {p === 'urgent' && <span className="badge badge-red" style={{ animation: 'pulse 1s infinite' }}>URGENT</span>}
                </div>
              </div>
              <div className="order-meta">
                <span>{o.user_name || o.customer_name}</span>
                <span>{timeSince(o.created_at)}</span>
                <span className="badge badge-purple">{o.order_type}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: o.order_source === 'app' ? '#5B5FE015' : '#FF9F0A15', color: o.order_source === 'app' ? '#5B5FE0' : '#FF9F0A' }}>
                  {o.order_source === 'app' ? 'APP' : 'WALK-IN'}
                </span>
              </div>
              <div className="priority-btns">
                {['normal', 'high', 'urgent'].map(pr => (
                  <button key={pr} className={`priority-btn ${p === pr ? `active-${pr}` : ''}`} onClick={() => setPriority(o.id, pr)} data-testid={`priority-${pr}-${o.id}`}>
                    {pr === 'urgent' ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#E23744"><circle cx="12" cy="12" r="10"/></svg>
                    ) : pr === 'high' ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#FF9F0A"><circle cx="12" cy="12" r="10"/></svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#D0D0D0"><circle cx="12" cy="12" r="10"/></svg>
                    )} {pr}
                  </button>
                ))}
              </div>
              <ul className="order-items">
                {o.items?.map((item: any, i: number) => (
                  <li key={i}>
                    <span style={{ fontWeight: 600 }}>{item.product_name}</span>
                    <span>{item.product_type === 'ready_made' ? `x${item.quantity || 1}` : `${item.grams}g`}</span>
                  </li>
                ))}
              </ul>
              <div className="order-actions">
                {o.status === 'pending' && <button className="btn btn-sm btn-purple" onClick={() => updateStatus(o.id, 'preparing')} data-testid={`start-${o.id}`}>Start Preparing</button>}
                {o.status === 'preparing' && <button className="btn btn-sm btn-green" onClick={() => updateStatus(o.id, 'ready')} data-testid={`ready-${o.id}`}>Mark Ready</button>}
                <button className="btn btn-sm btn-secondary" onClick={() => printTicket(o.id)} data-testid={`print-${o.id}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Print Ticket
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showTicket && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowTicket(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2>Kitchen Ticket</h2>
            <div id="kitchen-ticket-print" style={{ fontFamily: 'monospace', fontSize: 14 }}>
              <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>DIET CAFE</h2>
              <p style={{ textAlign: 'center', fontSize: 12, margin: 0, color: '#9C9C9C' }}>Kitchen Order Ticket</p>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <p><strong>Order:</strong> #{showTicket.order_id}</p>
              <p><strong>Type:</strong> {showTicket.order_type}</p>
              <p><strong>Customer:</strong> {showTicket.customer}</p>
              <p><strong>Time:</strong> {new Date(showTicket.time).toLocaleString()}</p>
              {showTicket.table && <p><strong>Table:</strong> {showTicket.table}</p>}
              {showTicket.priority !== 'normal' && (
                <div className={showTicket.priority === 'urgent' ? 'urgent' : 'high'}
                  style={{ textAlign: 'center', padding: 4, margin: '4px 0', fontWeight: 'bold', textTransform: 'uppercase',
                    background: showTicket.priority === 'urgent' ? '#FDE8EA' : '#FFF3E0',
                    color: showTicket.priority === 'urgent' ? '#E23744' : '#FF9F0A' }}>
                  {showTicket.priority} PRIORITY
                </div>
              )}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              {showTicket.items?.map((item: any, i: number) => (
                <div key={i} style={{ margin: '6px 0' }}>
                  <strong>{item.name}</strong> — {item.quantity}
                  {item.ingredients && (
                    <div style={{ marginLeft: 12, fontSize: 12, color: '#666' }}>
                      {item.ingredients.map((ing: any, j: number) => (
                        <div key={j}>• {ing.name}: {ing.grams}g</div>
                      ))}
                    </div>
                  )}
                  {item.customized && <div style={{ color: '#E23744', fontSize: 12, marginLeft: 12 }}>* CUSTOMIZED *</div>}
                </div>
              ))}
              {showTicket.special_notes && (
                <>
                  <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
                  <p><strong>Notes:</strong> {showTicket.special_notes}</p>
                </>
              )}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <p style={{ textAlign: 'center', fontSize: 11, color: '#9C9C9C' }}>Printed at {new Date().toLocaleString()}</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowTicket(null)}>Close</button>
              <button className="btn btn-purple" onClick={handlePrint} data-testid="print-ticket-confirm">Print</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
