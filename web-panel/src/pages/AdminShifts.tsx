import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function AdminShifts() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStaffId, setFormStaffId] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formStart, setFormStart] = useState('09:00');
  const [formEnd, setFormEnd] = useState('17:00');
  const [formNotes, setFormNotes] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  const load = async () => {
    try {
      const [s, st] = await Promise.all([api(`/shifts?date=${selectedDate}`), api('/staff')]);
      setShifts(s); setStaff(st);
    } catch {}
  };

  const loadAll = async () => {
    try {
      const [s, st] = await Promise.all([api('/shifts'), api('/staff')]);
      setShifts(s); setStaff(st);
    } catch {}
  };

  useEffect(() => {
    if (viewMode === 'list') loadAll(); else load();
  }, [selectedDate, viewMode]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api('/shifts', { method: 'POST', body: { staff_id: formStaffId, date: formDate, start_time: formStart, end_time: formEnd, notes: formNotes } });
      setShowModal(false);
      setFormStaffId(''); setFormNotes('');
      if (viewMode === 'list') loadAll(); else load();
    } catch (err: any) { alert(err.message); }
  };

  const updateShiftStatus = async (id: string, status: string) => {
    try {
      await api(`/shifts/${id}`, { method: 'PUT', body: { status } });
      if (viewMode === 'list') loadAll(); else load();
    } catch (err: any) { alert(err.message); }
  };

  const deleteShift = async (id: string) => {
    if (!confirm('Delete this shift?')) return;
    try {
      await api(`/shifts/${id}`, { method: 'DELETE' });
      if (viewMode === 'list') loadAll(); else load();
    } catch (err: any) { alert(err.message); }
  };

  const statusColors: Record<string, string> = { scheduled: '#5B5FE0', active: '#267E3E', completed: '#9C9C9C', cancelled: '#E23744' };
  const statusBadge: Record<string, string> = { scheduled: 'badge-purple', active: 'badge-green', completed: 'badge-gray', cancelled: 'badge-red' };

  // Group shifts by date
  const grouped = shifts.reduce((acc: Record<string, any[]>, s) => {
    const d = s.date || 'Unknown';
    if (!acc[d]) acc[d] = [];
    acc[d].push(s);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort().reverse();

  return (
    <div>
      <div className="page-header">
        <div><h1>Shift Management</h1><p>{shifts.length} shifts</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${viewMode === 'list' ? 'btn-purple' : 'btn-secondary'}`} onClick={() => setViewMode('list')} data-testid="view-list">All Shifts</button>
          <button className={`btn btn-sm ${viewMode === 'calendar' ? 'btn-purple' : 'btn-secondary'}`} onClick={() => setViewMode('calendar')} data-testid="view-calendar">By Date</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="add-shift-btn">+ Add Shift</button>
        </div>
      </div>

      {viewMode === 'calendar' && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Date:</label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #EFEFEF', fontSize: 14 }} data-testid="shift-date-picker" />
        </div>
      )}

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Staff', value: staff.length, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B5FE0" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>, color: '#5B5FE0' },
          { label: 'Kitchen Staff', value: staff.filter(s => s.role === 'kitchen').length, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF9F0A" strokeWidth="2"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg>, color: '#FF9F0A' },
          { label: 'Cashier Staff', value: staff.filter(s => s.role === 'cashier').length, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#267E3E" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>, color: '#267E3E' },
          { label: 'Scheduled', value: shifts.filter(s => s.status === 'scheduled').length, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#E23744" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, color: '#E23744' },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-icon" style={{ background: `${s.color}15` }}>{s.icon}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {sortedDates.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9C9C9C" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
          <h3>No shifts found</h3>
          <p>{viewMode === 'calendar' ? `No shifts on ${selectedDate}` : 'Create your first shift'}</p>
        </div>
      )}

      {sortedDates.map(date => (
        <div key={date} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#9C9C9C', marginBottom: 10, textTransform: 'uppercase' }}>
            {new Date(date + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
            {grouped[date].map((shift: any) => (
              <div key={shift.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid #EFEFEF`, borderLeft: `4px solid ${statusColors[shift.status] || '#9C9C9C'}` }} data-testid={`shift-card-${shift.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{shift.staff_name}</div>
                    <span className={`badge ${shift.staff_role === 'kitchen' ? 'badge-orange' : 'badge-green'}`}>{shift.staff_role}</span>
                  </div>
                  <span className={`badge ${statusBadge[shift.status] || 'badge-gray'}`}>{shift.status}</span>
                </div>
                <div style={{ fontSize: 13, color: '#9C9C9C', marginBottom: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle', marginRight: 4 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {shift.start_time} - {shift.end_time}
                </div>
                {shift.notes && <p style={{ fontSize: 12, color: '#9C9C9C', fontStyle: 'italic', marginBottom: 8 }}>{shift.notes}</p>}
                <div style={{ display: 'flex', gap: 6 }}>
                  {shift.status === 'scheduled' && (
                    <>
                      <button className="btn btn-sm btn-green" onClick={() => updateShiftStatus(shift.id, 'active')} data-testid={`activate-shift-${shift.id}`}>Start</button>
                      <button className="btn btn-sm btn-danger" onClick={() => updateShiftStatus(shift.id, 'cancelled')} data-testid={`cancel-shift-${shift.id}`}>Cancel</button>
                    </>
                  )}
                  {shift.status === 'active' && (
                    <button className="btn btn-sm btn-secondary" onClick={() => updateShiftStatus(shift.id, 'completed')} data-testid={`complete-shift-${shift.id}`}>Complete</button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => deleteShift(shift.id)} data-testid={`delete-shift-${shift.id}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>Create Shift</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Staff Member</label>
                <select value={formStaffId} onChange={e => setFormStaffId(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #EFEFEF', fontSize: 15 }} data-testid="shift-staff-select" required>
                  <option value="">Select staff...</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
              </div>
              <div className="form-group"><label>Date</label><input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} data-testid="shift-date-input" required /></div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}><label>Start Time</label><input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} data-testid="shift-start-input" required /></div>
                <div className="form-group" style={{ flex: 1 }}><label>End Time</label><input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} data-testid="shift-end-input" required /></div>
              </div>
              <div className="form-group"><label>Notes (optional)</label><input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="e.g., Morning prep duty" data-testid="shift-notes-input" /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" data-testid="save-shift-btn">Create Shift</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
