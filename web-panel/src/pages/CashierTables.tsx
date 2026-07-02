import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

// Store scope: /tables (GET + occupy/release) is scoped server-side to the
// staff member's own store (FIX 5) — no store_id is passed from here.
export default function CashierTables() {
  const [tables, setTables] = useState<any[]>([]);
  const load = async () => { try { setTables(await api('/tables')); } catch {} };
  useEffect(() => { load(); }, []);

  const toggle = async (num: number, occupied: boolean) => {
    try {
      if (occupied) await api(`/tables/${num}/release`, { method: 'POST' });
      else await api(`/tables/${num}/occupy`, { method: 'POST' });
      load();
    } catch (e: any) { alert(e.message); }
  };

  // FIX 5.2 — jump to POS with this table pre-selected (dine-in + table picker).
  const newOrder = (num: number) => { window.location.href = `/cashier?table=${num}`; };

  const occupied = tables.filter(t => t.is_occupied || t.status === 'occupied').length;

  return (
    <div>
      <div className="page-header">
        <div><h1>Tables</h1><p>{occupied}/{tables.length} occupied</p></div>
      </div>
      <div className="tables-grid">
        {tables.map(t => {
          const isOcc = t.is_occupied || t.status === 'occupied';
          return (
            <div key={t.table_number} className={`table-card ${isOcc ? 'occupied' : 'available'}`} onClick={() => toggle(t.table_number, isOcc)} data-testid={`table-${t.table_number}`}>
              <span className="table-glyph" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 20V10M18 20V10M5 10h14l-1-6H6l-1 6Z" />
                </svg>
              </span>
              <span className="table-number">T{t.table_number}</span>
              <span className="table-status">{isOcc ? 'Occupied' : 'Free'}</span>
              <button className="table-new-order" data-testid={`table-new-order-${t.table_number}`} onClick={e => { e.stopPropagation(); newOrder(t.table_number); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New order
              </button>
            </div>
          );
        })}
      </div>
      {tables.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 20V10M18 20V10M5 10h14l-1-6H6l-1 6Z" /></svg>
          </div>
          <h3>No tables configured</h3>
        </div>
      )}
    </div>
  );
}
