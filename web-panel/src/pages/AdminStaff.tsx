import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function AdminStaff() {
  const [staff, setStaff] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState(''); const [role, setRole] = useState('kitchen'); const [pin, setPin] = useState('');

  const load = async () => { try { setStaff(await api('/staff')); } catch {} };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/staff', { method: 'POST', body: { name, role, pin } });
      setShowModal(false); setName(''); setPin(''); load();
    } catch (err: any) { alert(err.message); }
  };

  const deleteStaff = async (id: string) => {
    if (!confirm('Remove this staff member?')) return;
    try { await api(`/staff/${id}`, { method: 'DELETE' }); load(); } catch (err: any) { alert(err.message); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try { await api(`/staff/${id}`, { method: 'PUT', body: { is_active: !active } }); load(); } catch {}
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Staff Management</h1><p>{staff.length} members</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="add-staff-btn">+ Add Staff</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Role</th><th>PIN</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.id}>
              <td style={{fontWeight:600}}>{s.name}</td>
              <td><span className={`badge ${s.role==='kitchen'?'badge-orange':'badge-purple'}`}>{s.role}</span></td>
              <td style={{fontFamily:'monospace',letterSpacing:2}}>{s.pin}</td>
              <td><span className={`badge ${s.is_active?'badge-green':'badge-gray'}`}>{s.is_active?'Active':'Inactive'}</span></td>
              <td>
                <div style={{display:'flex',gap:6}}>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(s.id, s.is_active)}>{s.is_active?'Disable':'Enable'}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteStaff(s.id)} data-testid={`delete-staff-${s.id}`}>Remove</button>
                </div>
              </td>
            </tr>
          ))}
          {staff.length === 0 && <tr><td colSpan={5} style={{textAlign:'center',padding:40,color:'#9C9C9C'}}>No staff yet. Add kitchen or cashier staff.</td></tr>}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>Add Staff</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group"><label>Name</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Staff name" data-testid="staff-name-input" required /></div>
              <div className="form-group">
                <label>Role</label>
                <div style={{display:'flex',gap:8}}>
                  {['kitchen','cashier'].map(r => (
                    <button key={r} type="button" className={`btn ${role===r?'btn-primary':'btn-secondary'}`} style={{flex:1}} onClick={() => setRole(r)} data-testid={`role-${r}`}>
                      {r === 'kitchen' ? '🔥 Kitchen' : '💳 Cashier'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group"><label>PIN (4-6 digits)</label><input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="PIN" maxLength={6} data-testid="staff-pin-input" required /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" data-testid="save-staff-btn" disabled={!name||pin.length<4}>Create Staff</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
