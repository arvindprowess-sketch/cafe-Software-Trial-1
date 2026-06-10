import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// Stores & clusters management.
// - super_admin: full CRUD (create/edit/deactivate) + cluster overview.
// - area_manager: READ-ONLY view of own cluster.
// - others: not available (also hidden from nav).

const EMPTY = { name: '', code: '', address: '', phone: '', gst_no: '', fssai_license: '', gst_expiry_at: '', fssai_expiry_at: '', open_hours: '', area_manager_id: '', status: 'active', lat: '', lng: '' };

// PR-2: whole days until an ISO date (negative = past); null when missing.
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10));
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
// Render a date cell with a red badge when within 30 days / expired.
function ExpiryCell({ label, iso }: { label: string; iso?: string | null }) {
  const d = daysUntil(iso);
  if (!iso) return <span style={{ color: '#C0392B', fontSize: 12 }}>{label}: missing</span>;
  const warn = d !== null && d <= 30;
  return (
    <span style={{ fontSize: 12 }}>
      {label}: {String(iso).slice(0, 10)}{' '}
      {warn && <span className="badge badge-red" data-testid={`expiry-warn-${label.toLowerCase()}`}>{d! < 0 ? 'expired' : `${d}d`}</span>}
    </span>
  );
}

export default function HqStores() {
  const { user } = useAuth();
  const { reload: reloadSwitcher } = useStores();
  const isHQ = user?.role === 'super_admin' || user?.role === 'admin';
  const isArea = user?.role === 'area_manager';

  const [stores, setStores] = useState<any[]>([]);
  const [areaManagers, setAreaManagers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const list = await api('/stores'); // role-scoped server-side
      setStores(list);
    } catch {}
    if (isHQ) {
      try {
        const staff = await api('/staff');
        setAreaManagers((staff || []).filter((s: any) => s.role === 'area_manager'));
      } catch {}
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (!isHQ && !isArea) {
    return <div style={{ padding: 40, color: '#9C9C9C' }}>This screen is not available for your role.</div>;
  }

  const amName = (id?: string | null) => areaManagers.find((a) => a.id === id)?.name || (id ? id.slice(0, 8) : '—');

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowForm(true); };
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({
      name: s.name || '', code: s.code || '', address: s.address || '', phone: s.phone || '',
      gst_no: s.gst_no || '', fssai_license: s.fssai_license || '', open_hours: s.open_hours || '',
      gst_expiry_at: s.gst_expiry_at ? String(s.gst_expiry_at).slice(0, 10) : '',
      fssai_expiry_at: s.fssai_expiry_at ? String(s.fssai_expiry_at).slice(0, 10) : '',
      area_manager_id: s.area_manager_id || '', status: s.status || 'active',
      lat: s.lat ?? '', lng: s.lng ?? '',
    });
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code) { alert('Name and code are required'); return; }
    setSaving(true);
    try {
      const body: any = {
        name: form.name, code: form.code, address: form.address || null, phone: form.phone || null,
        gst_no: form.gst_no || null, fssai_license: form.fssai_license || null, open_hours: form.open_hours || null,
        gst_expiry_at: form.gst_expiry_at || null, fssai_expiry_at: form.fssai_expiry_at || null,
        area_manager_id: form.area_manager_id || null, status: form.status,
      };
      if (form.lat !== '') body.lat = parseFloat(form.lat);
      if (form.lng !== '') body.lng = parseFloat(form.lng);
      if (editing) await api(`/stores/${editing.store_id}`, { method: 'PUT', body });
      else await api('/stores', { method: 'POST', body });
      setShowForm(false);
      await load();
      reloadSwitcher();
    } catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  const deactivate = async (s: any) => {
    if (!confirm(`Deactivate ${s.name}? Historical data is preserved.`)) return;
    try { await api(`/stores/${s.store_id}`, { method: 'DELETE' }); await load(); reloadSwitcher(); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Stores &amp; Clusters</h1>
          <p>{stores.length} store(s){isArea ? ' in your cluster (read-only)' : ''}</p>
        </div>
        {isHQ && <button className="btn btn-primary" onClick={openCreate} data-testid="add-store-btn">+ New Store</button>}
      </div>

      <table className="data-table" data-testid="stores-table">
        <thead><tr><th>Store</th><th>Code</th><th>Address</th><th>Area Manager</th><th>Compliance expiry</th><th>Status</th>{isHQ && <th style={{ width: 150 }}>Actions</th>}</tr></thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.store_id} data-testid={`store-row-${s.store_id}`}>
              <td><strong>{s.name}</strong></td>
              <td><span className="badge badge-purple">{s.code}</span></td>
              <td style={{ fontSize: 13, color: '#696969' }}>{s.address || '—'}</td>
              <td style={{ fontSize: 13 }}>{isHQ ? amName(s.area_manager_id) : (s.area_manager_id ? amName(s.area_manager_id) : '—')}</td>
              <td data-testid={`store-compliance-${s.store_id}`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <ExpiryCell label="GST" iso={s.gst_expiry_at} />
                  <ExpiryCell label="FSSAI" iso={s.fssai_expiry_at} />
                </div>
              </td>
              <td><span className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{s.status}</span></td>
              {isHQ && (
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(s)} data-testid={`edit-store-${s.store_id}`}>Edit</button>
                    {s.status === 'active' && <button className="btn btn-sm btn-danger" onClick={() => deactivate(s)} data-testid={`deactivate-store-${s.store_id}`}>Deactivate</button>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {stores.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }}>No stores in scope.</div>}

      {/* Cluster overview */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18 }}>Clusters</h2>
        <p style={{ color: '#9C9C9C', fontSize: 13, marginTop: -4 }}>Which stores each area manager oversees.</p>
        {isHQ ? (
          areaManagers.length === 0 ? <div style={{ color: '#9C9C9C', fontSize: 13 }}>No area managers yet.</div> :
          <div style={{ display: 'grid', gap: 10 }} data-testid="cluster-list">
            {areaManagers.map((am) => {
              const clusterIds: string[] = am.cluster_store_ids || [];
              const names = stores.filter((s) => clusterIds.includes(s.store_id)).map((s) => s.name);
              return (
                <div key={am.id} style={{ background: '#FAFAFA', border: '1px solid #EFEFEF', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700 }}>{am.name} <span style={{ color: '#9C9C9C', fontWeight: 400, fontSize: 12 }}>· area manager</span></div>
                  <div style={{ fontSize: 13, color: '#696969', marginTop: 4 }}>
                    {clusterIds.length ? (names.length ? names.join(', ') : `${clusterIds.length} store(s)`) : 'No stores assigned'}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: '#FAFAFA', border: '1px solid #EFEFEF', borderRadius: 10, padding: 12, fontSize: 13, color: '#696969' }} data-testid="my-cluster">
            Your cluster: {stores.map((s) => s.name).join(', ') || '—'}
          </div>
        )}
      </div>

      {showForm && isHQ && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2>{editing ? `Edit ${editing.name}` : 'New Store'}</h2>
            <form onSubmit={save}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="store-name" /></div>
                <div className="form-group"><label>Code *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required data-testid="store-code" /></div>
              </div>
              <div className="form-group"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="store-address" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="form-group"><label>Open hours</label><input value={form.open_hours} onChange={(e) => setForm({ ...form, open_hours: e.target.value })} placeholder="9am–11pm" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>GST No.</label><input value={form.gst_no} onChange={(e) => setForm({ ...form, gst_no: e.target.value })} data-testid="store-gst" /></div>
                <div className="form-group"><label>FSSAI License</label><input value={form.fssai_license} onChange={(e) => setForm({ ...form, fssai_license: e.target.value })} data-testid="store-fssai" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>GST expiry</label><input type="date" value={form.gst_expiry_at} onChange={(e) => setForm({ ...form, gst_expiry_at: e.target.value })} data-testid="store-gst-expiry" /></div>
                <div className="form-group"><label>FSSAI expiry</label><input type="date" value={form.fssai_expiry_at} onChange={(e) => setForm({ ...form, fssai_expiry_at: e.target.value })} data-testid="store-fssai-expiry" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Latitude</label><input type="number" step="any" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></div>
                <div className="form-group"><label>Longitude</label><input type="number" step="any" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Area Manager</label>
                  <select value={form.area_manager_id} onChange={(e) => setForm({ ...form, area_manager_id: e.target.value })} data-testid="store-area-manager">
                    <option value="">— None —</option>
                    {areaManagers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="store-status">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="save-store-btn">{saving ? 'Saving…' : (editing ? 'Update Store' : 'Create Store')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
