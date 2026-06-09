import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';
import { useRealtime } from '../utils/realtime';
import { useAuth } from '../context/AuthContext';
import { roomsForUser } from '../utils/rooms';

const KITCHEN_DIET_LABEL: Record<string, string> = { 'veg': 'Veg', 'non-veg': 'Non-Veg', 'vegan': 'Vegan', 'eggetarian': 'Egg', 'jain': 'Jain', 'keto': 'Keto', 'high-protein': 'High-Pro' };
const itemDietTags = (item: any, map: Record<string, string[]>): string[] => {
  if (item.diet_types && item.diet_types.length) return item.diet_types;
  if (item.diet_type) return [item.diet_type];
  return map[item.product_id] || [];
};
const DietTagRow = ({ item, map }: { item: any; map: Record<string, string[]> }) => {
  const tags = itemDietTags(item, map);
  if (!tags.length) return null;
  return (
    <span style={{ marginLeft: 6, display: 'inline-flex', gap: 3, flexWrap: 'wrap', verticalAlign: 'middle' }} data-testid="kitchen-item-diet">
      {tags.slice(0, 4).map((t: string) => (
        <span key={t} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: t === 'non-veg' ? '#F1E7E1' : '#EAF2DD', color: t === 'non-veg' ? '#15140F' : '#2C7A3D' }}>{KITCHEN_DIET_LABEL[t] || t}</span>
      ))}
    </span>
  );
};

export default function KitchenOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [scheduledOrders, setScheduledOrders] = useState<any[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastOrderCount, setLastOrderCount] = useState(0);
  const [showTicket, setShowTicket] = useState<any>(null);
  const [alertOrder, setAlertOrder] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'upcoming'>('active');
  const [dietMap, setDietMap] = useState<Record<string, string[]>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const alertedOrdersRef = useRef<Set<string>>(new Set());

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

  // Map product_id -> diet tags so the cook can see veg/vegan/jain etc. (no order-schema change)
  useEffect(() => {
    api('/products').then((ps: any[]) => {
      const m: Record<string, string[]> = {};
      ps.forEach((p: any) => { m[p.id] = (p.diet_types && p.diet_types.length) ? p.diet_types : [p.diet_type].filter(Boolean); });
      setDietMap(m);
    }).catch(() => {});
  }, []);

  const load = async () => {
    try {
      const [data, scheduled] = await Promise.all([
        api('/orders/kitchen'),
        api('/orders/scheduled').catch(() => [])
      ]);
      const pOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
      data.sort((a: any, b: any) => (pOrder[a.priority || 'normal'] ?? 2) - (pOrder[b.priority || 'normal'] ?? 2));

      // Check for new orders
      const currentIds = new Set(data.map((o: any) => o.id));
      const newOrders = data.filter((o: any) => !prevOrderIdsRef.current.has(o.id));
      if (newOrders.length > 0 && prevOrderIdsRef.current.size > 0) {
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
      setScheduledOrders(scheduled);

      // Check for scheduled orders that need alert (alert_triggered && not yet shown)
      if (!alertOrder) {
        const alertReady = scheduled.find((o: any) => o.alert_triggered && !alertedOrdersRef.current.has(o.id));
        if (alertReady) {
          setAlertOrder(alertReady);
          alertedOrdersRef.current.add(alertReady.id);
          playAlertSound('urgent');
        }
      }
    } catch {}
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000); // safety fallback; real-time push is primary
    return () => clearInterval(iv);
  }, []);

  // Real-time: refresh instantly when orders arrive or change (C1/C5),
  // scoped to this staff member's store rooms only.
  const { connected } = useRealtime(roomsForUser(user, 'kitchen'), (msg) => {
    if (['new_order', 'order_status', 'menu_update', 'scheduled_order'].includes(msg.type)) {
      load();
    }
  });

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

  const confirmScheduledOrder = async (orderId: string) => {
    setConfirming(true);
    try {
      await api(`/orders/${orderId}/confirm-scheduled`, { method: 'POST' });
      setAlertOrder(null);
      load();
    } catch (e: any) { alert(e.message); } finally { setConfirming(false); }
  };

  const formatTime = (iso: string) => {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
  };

  const timeUntil = (iso: string) => {
    if (!iso) return '';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return 'NOW';
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
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
      .urgent{background:#fee;color:#c00}.high{background:#F2EEE0;color:#9A6E1E}</style></head><body>`);
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
        <div><h1>Orders</h1><p>{orders.length} active{scheduledOrders.length > 0 ? ` • ${scheduledOrders.length} upcoming` : ''}</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span data-testid="live-status" style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: connected ? '#EAF2DD' : '#F1E7E1', color: connected ? '#3FA34D' : '#C0392B', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: connected ? '#3FA34D' : '#C0392B', display: 'inline-block', animation: connected ? 'pulse 1.5s infinite' : 'none' }} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
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

      {/* Tabs: Active / Upcoming */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F0F0F0', borderRadius: 10, padding: 3 }} data-testid="kitchen-tabs">
        <button
          className={`btn btn-sm ${activeTab === 'active' ? 'btn-green' : ''}`}
          style={{ flex: 1, borderRadius: 8, fontWeight: activeTab === 'active' ? 700 : 500, background: activeTab === 'active' ? '#3FA34D' : 'transparent', color: activeTab === 'active' ? '#FFF' : '#696969' }}
          onClick={() => setActiveTab('active')}
          data-testid="tab-active"
        >
          Active ({orders.length})
        </button>
        <button
          className={`btn btn-sm ${activeTab === 'upcoming' ? 'btn-purple' : ''}`}
          style={{ flex: 1, borderRadius: 8, fontWeight: activeTab === 'upcoming' ? 700 : 500, background: activeTab === 'upcoming' ? '#15140F' : 'transparent', color: activeTab === 'upcoming' ? '#FFF' : '#696969', position: 'relative' }}
          onClick={() => setActiveTab('upcoming')}
          data-testid="tab-upcoming"
        >
          Upcoming ({scheduledOrders.length})
          {scheduledOrders.some(o => o.alert_triggered) && (
            <span style={{ position: 'absolute', top: 2, right: 8, width: 8, height: 8, borderRadius: 4, background: '#15140F', animation: 'pulse 1s infinite' }} />
          )}
        </button>
      </div>

      {activeTab === 'active' && orders.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3FA34D" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h3>All caught up!</h3>
          <p>No pending orders right now</p>
        </div>
      )}

      {activeTab === 'active' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 14 }}>
        {orders.map(o => {
          const p = o.priority || 'normal';
          return (
            <div className={`order-card ${p === 'urgent' ? 'urgent' : p === 'high' ? 'high' : ''}`} key={o.id} data-testid={`order-card-${o.id}`}>
              <div className="order-header">
                <span className="order-id">#{o.id}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${o.status === 'pending' ? 'badge-orange' : o.status === 'accepted' ? 'badge-blue' : o.status === 'preparing' ? 'badge-purple' : 'badge-green'}`}>{o.status.toUpperCase()}</span>
                  {p === 'urgent' && <span className="badge badge-red" style={{ animation: 'pulse 1s infinite' }}>URGENT</span>}
                </div>
              </div>
              <div className="order-meta">
                <span>{o.user_name || o.customer_name}</span>
                <span>{timeSince(o.created_at)}</span>
                <span className="badge badge-purple">{o.order_type}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: o.order_source === 'app' ? '#15140F15' : '#D69A3515', color: o.order_source === 'app' ? '#15140F' : '#D69A35' }}>
                  {o.order_source === 'app' ? 'APP' : 'WALK-IN'}
                </span>
              </div>
              <div className="priority-btns">
                {['normal', 'high', 'urgent'].map(pr => (
                  <button key={pr} className={`priority-btn ${p === pr ? `active-${pr}` : ''}`} onClick={() => setPriority(o.id, pr)} data-testid={`priority-${pr}-${o.id}`}>
                    {pr === 'urgent' ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#15140F"><circle cx="12" cy="12" r="10"/></svg>
                    ) : pr === 'high' ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#D69A35"><circle cx="12" cy="12" r="10"/></svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#D0D0D0"><circle cx="12" cy="12" r="10"/></svg>
                    )} {pr}
                  </button>
                ))}
              </div>
              <ul className="order-items">
                {o.items?.map((item: any, i: number) => (
                  <li key={i}>
                    <span style={{ fontWeight: 600 }}>{item.product_name}<DietTagRow item={item} map={dietMap} /></span>
                    <span>{item.product_type === 'ready_made' ? `x${item.quantity || 1}` : `${item.grams}g`}</span>
                  </li>
                ))}
              </ul>
              <div className="order-actions">
                {o.status === 'pending' && <button className="btn btn-sm btn-blue" onClick={() => updateStatus(o.id, 'accepted')} data-testid={`accept-${o.id}`}>Accept Order</button>}
                {o.status === 'accepted' && <button className="btn btn-sm btn-purple" onClick={() => updateStatus(o.id, 'preparing')} data-testid={`start-${o.id}`}>Start Preparing</button>}
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
      )}

      {/* Upcoming Scheduled Orders Tab */}
      {activeTab === 'upcoming' && (
        <div>
          {scheduledOrders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#15140F" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <h3>No Scheduled Orders</h3>
              <p>Scheduled orders from customers will appear here</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 14 }}>
              {scheduledOrders.map(o => (
                <div key={o.id} className={`order-card ${o.alert_triggered ? 'urgent' : ''}`} data-testid={`scheduled-card-${o.id}`}
                  style={{ borderLeft: `4px solid ${o.alert_triggered ? '#15140F' : '#15140F'}` }}
                >
                  <div className="order-header">
                    <span className="order-id">#{o.id}</span>
                    <span className={`badge ${o.alert_triggered ? 'badge-red' : 'badge-purple'}`} style={o.alert_triggered ? { animation: 'pulse 1s infinite' } : {}}>
                      {o.alert_triggered ? 'ALERT - START NOW' : 'UPCOMING'}
                    </span>
                  </div>
                  <div className="order-meta">
                    <span>{o.user_name || o.customer_name}</span>
                    <span className="badge badge-purple">{o.order_type}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: o.order_source === 'app' ? '#15140F15' : '#D69A3515', color: o.order_source === 'app' ? '#15140F' : '#D69A35' }}>
                      {o.order_source === 'app' ? 'APP' : 'WALK-IN'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, margin: '10px 0', padding: '10px 12px', background: '#F7F4EC', borderRadius: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#9C9C9C', fontWeight: 600 }}>Ready at</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#15140F' }}>{formatTime(o.scheduled_ready_time)}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#9C9C9C', fontWeight: 600 }}>Kitchen alert</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: o.alert_triggered ? '#15140F' : '#15140F' }}>{formatTime(o.kitchen_alert_time)}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: '#9C9C9C', fontWeight: 600 }}>Time until</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#15140F' }}>{timeUntil(o.scheduled_ready_time)}</div>
                    </div>
                  </div>
                  <ul className="order-items">
                    {o.items?.map((item: any, i: number) => (
                      <li key={i}>
                        <span style={{ fontWeight: 600 }}>{item.product_name}<DietTagRow item={item} map={dietMap} /></span>
                        <span>{item.product_type === 'ready_made' ? `x${item.quantity || 1}` : `${item.grams}g`}</span>
                      </li>
                    ))}
                  </ul>
                  {o.alert_triggered && (
                    <button className="btn btn-sm btn-green" style={{ width: '100%', fontWeight: 700 }}
                      onClick={() => { setAlertOrder(o); }}
                      data-testid={`start-scheduled-${o.id}`}
                    >
                      Confirm & Start Preparing
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* BLOCKING SCHEDULED ORDER ALERT POPUP */}
      {alertOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          data-testid="scheduled-alert-overlay"
        >
          <div style={{ background: '#FFF', borderRadius: 16, padding: 28, maxWidth: 480, width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', border: '3px solid #15140F', animation: 'popIn 0.3s ease-out' }}
            data-testid="scheduled-alert-popup"
          >
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1E7E1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', animation: 'pulse 1.5s infinite' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#15140F" strokeWidth="2.5">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#15140F', letterSpacing: 2, marginBottom: 8 }}>SCHEDULED ORDER ALERT</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#15140F', marginBottom: 4 }}>#{alertOrder.id}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, margin: '14px 0' }}>
              <div style={{ background: '#F7F4EC', borderRadius: 10, padding: '10px 18px' }}>
                <div style={{ fontSize: 10, color: '#9C9C9C', fontWeight: 600 }}>Order Type</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#15140F', textTransform: 'capitalize' }}>{alertOrder.order_type}</div>
              </div>
              <div style={{ background: '#F1E7E1', borderRadius: 10, padding: '10px 18px' }}>
                <div style={{ fontSize: 10, color: '#9C9C9C', fontWeight: 600 }}>Ready At</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#15140F' }}>{formatTime(alertOrder.scheduled_ready_time)}</div>
              </div>
              <div style={{ background: '#F1F7E9', borderRadius: 10, padding: '10px 18px' }}>
                <div style={{ fontSize: 10, color: '#9C9C9C', fontWeight: 600 }}>Customer</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#3FA34D' }}>{alertOrder.user_name || alertOrder.customer_name}</div>
              </div>
            </div>
            <div style={{ textAlign: 'left', background: '#FAFAFA', borderRadius: 10, padding: 14, margin: '14px 0', border: '1px solid #EFEFEF' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#15140F', marginBottom: 8 }}>Items (ingredient-wise grams):</div>
              {alertOrder.items?.map((item: any, i: number) => (
                <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < alertOrder.items.length - 1 ? '1px solid #EFEFEF' : 'none' }}>
                  <div style={{ fontWeight: 700, color: '#15140F', fontSize: 14 }}>
                    {item.product_name} {item.product_type === 'ready_made' ? `× ${item.quantity || 1}` : `— ${item.grams}g`}
                  </div>
                  {item.ingredients_breakdown?.map((ing: any, j: number) => (
                    <div key={j} style={{ marginLeft: 14, fontSize: 12, color: '#696969' }}>
                      • {ing.name}: <strong>{ing.total_grams || ing.grams_per_serving}g</strong>
                    </div>
                  ))}
                  {item.customized_ingredients?.map((ing: any, j: number) => (
                    <div key={`c${j}`} style={{ marginLeft: 14, fontSize: 12, color: '#15140F' }}>
                      • {ing.name}: <strong>{ing.grams_per_serving}g</strong> (customized)
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <button
              className="btn btn-green"
              style={{ width: '100%', padding: '16px 24px', fontSize: 16, fontWeight: 800, borderRadius: 12, cursor: confirming ? 'wait' : 'pointer' }}
              onClick={() => confirmScheduledOrder(alertOrder.id)}
              disabled={confirming}
              data-testid="confirm-start-btn"
            >
              {confirming ? 'Confirming...' : 'Confirm & Start Preparing'}
            </button>
            <div style={{ fontSize: 11, color: '#9C9C9C', marginTop: 10 }}>This popup cannot be dismissed without confirmation</div>
          </div>
        </div>
      )}

      {showTicket && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowTicket(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2>Kitchen Ticket</h2>
            <div id="kitchen-ticket-print" style={{ fontFamily: 'monospace', fontSize: 14 }}>
              <h2 style={{ textAlign: 'center', margin: '0 0 4px' }}>BORAROC</h2>
              <p style={{ textAlign: 'center', fontSize: 12, margin: 0, color: '#9C9C9C' }}>Kitchen Order Ticket</p>
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              <p><strong>Order:</strong> #{showTicket.order_id}</p>
              <p><strong>Type:</strong> {showTicket.order_type}</p>
              <p><strong>Customer:</strong> {showTicket.customer}</p>
              <p><strong>Time:</strong> {new Date(showTicket.time).toLocaleString()}</p>
              {showTicket.total_preparation_time_minutes > 0 && (
                <p data-testid="ticket-prep-time"><strong>Prep ETA:</strong> {showTicket.total_preparation_time_minutes} min (longest item)</p>
              )}
              {showTicket.table && <p><strong>Table:</strong> {showTicket.table}</p>}
              {showTicket.priority !== 'normal' && (
                <div className={showTicket.priority === 'urgent' ? 'urgent' : 'high'}
                  style={{ textAlign: 'center', padding: 4, margin: '4px 0', fontWeight: 'bold', textTransform: 'uppercase',
                    background: showTicket.priority === 'urgent' ? '#F1E7E1' : '#F2EEE0',
                    color: showTicket.priority === 'urgent' ? '#15140F' : '#D69A35' }}>
                  {showTicket.priority} PRIORITY
                </div>
              )}
              <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
              {showTicket.items?.map((item: any, i: number) => (
                <div key={i} style={{ margin: '6px 0' }}>
                  <strong>{item.name}</strong> — {item.quantity}
                  {item.preparation_time_minutes > 0 && <span style={{ color: '#888', fontSize: 12 }}> ({item.preparation_time_minutes} min)</span>}
                  {item.ingredients && (
                    <div style={{ marginLeft: 12, fontSize: 12, color: '#666' }}>
                      {item.ingredients.map((ing: any, j: number) => (
                        <div key={j}>• {ing.name}: {ing.grams}g</div>
                      ))}
                    </div>
                  )}
                  {item.customized && <div style={{ color: '#15140F', fontSize: 12, marginLeft: 12 }}>* CUSTOMIZED *</div>}
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
        @keyframes popIn {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
