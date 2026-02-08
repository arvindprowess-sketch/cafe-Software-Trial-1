import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function AdminOffers() {
  const [offers, setOffers] = useState<any[]>([]);
  const load = async () => { try { setOffers(await api('/offers/all')); } catch {} };
  useEffect(() => { load(); }, []);

  const toggleOffer = async (id: string, active: boolean) => {
    try { await api(`/offers/${id}`, { method: 'PUT', body: { is_active: !active } }); load(); } catch {}
  };

  return (
    <div>
      <div className="page-header"><div><h1>Offers</h1><p>{offers.length} offers</p></div></div>
      <table className="data-table">
        <thead><tr><th>Title</th><th>Type</th><th>Discount</th><th>Code</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {offers.map(o => (
            <tr key={o.id}>
              <td style={{fontWeight:600}}>{o.title}</td>
              <td><span className="badge badge-purple">{o.discount_type}</span></td>
              <td>{o.discount_type==='percent'?`${o.discount_value}%`:`₹${o.discount_value}`}</td>
              <td style={{fontFamily:'monospace'}}>{o.coupon_code||'-'}</td>
              <td><span className={`badge ${o.is_active?'badge-green':'badge-gray'}`}>{o.is_active?'Active':'Inactive'}</span></td>
              <td><button className="btn btn-sm btn-secondary" onClick={() => toggleOffer(o.id, o.is_active)}>{o.is_active?'Disable':'Enable'}</button></td>
            </tr>
          ))}
          {offers.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#9C9C9C'}}>No offers yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
