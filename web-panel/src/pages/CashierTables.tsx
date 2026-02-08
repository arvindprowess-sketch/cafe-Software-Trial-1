import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

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

  const occupied = tables.filter(t => t.is_occupied).length;

  return (
    <div>
      <div className="page-header"><div><h1>Tables</h1><p>{occupied}/{tables.length} occupied</p></div></div>
      <div className="tables-grid">
        {tables.map(t => (
          <div key={t.table_number} className={`table-card ${t.is_occupied?'occupied':'available'}`} onClick={() => toggle(t.table_number, t.is_occupied)} data-testid={`table-${t.table_number}`}>
            <span style={{fontSize:24}}>{t.is_occupied?'👥':'🪑'}</span>
            <span className="table-number" style={{color:t.is_occupied?'#E23744':'#267E3E'}}>T{t.table_number}</span>
            <span className="table-status">{t.is_occupied?'Occupied':'Free'}</span>
          </div>
        ))}
      </div>
      {tables.length === 0 && <div className="empty-state"><div className="empty-icon">🪑</div><h3>No tables configured</h3></div>}
    </div>
  );
}
