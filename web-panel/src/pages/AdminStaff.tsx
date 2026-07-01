import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';

// Mirror of backend LOGIN_CODE_RE (server.py:597): 3-32 chars, starts
// alphanumeric, then letters/digits/dot/dash/underscore. Case-insensitive on
// the backend; we keep the input uppercased for a consistent display code.
const LOGIN_CODE_RE = /^[A-Z0-9][A-Z0-9._-]{2,31}$/;

// Roles that match backend STAFF_CREATE_ROLES (server.py:6432).
const ROLES = [
  { key: 'kitchen', label: 'Kitchen', badge: 'badge-orange' },
  { key: 'cashier', label: 'Cashier', badge: 'badge-blue' },
  { key: 'store_manager', label: 'Store Manager', badge: 'badge-purple' },
  { key: 'area_manager', label: 'Area Manager', badge: 'badge-green' },
];
const roleBadge = (r: string) => ROLES.find(x => x.key === r)?.badge || 'badge-gray';
const roleLabel = (r: string) => ROLES.find(x => x.key === r)?.label || r;

// Strong 12-char password using the browser CSPRNG. Avoids easily-confused
// characters (0/O, 1/l/I) and stays within a printable, typeable set.
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?';
  const buf = new Uint32Array(12);
  window.crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}

export default function AdminStaff() {
  const [staff, setStaff] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  // Create form state
  const [name, setName] = useState('');
  const [role, setRole] = useState('kitchen');
  const [loginCode, setLoginCode] = useState('');
  const [password, setPassword] = useState('');
  const [storeId, setStoreId] = useState('');
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // One-time credentials returned by the backend after a successful create.
  const [createdCreds, setCreatedCreds] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => { try { setStaff(await api('/staff')); } catch {} };
  const loadStores = async () => { try { setStores(await api('/stores')); } catch {} };
  useEffect(() => { load(); loadStores(); }, []);

  const storeName = useMemo(() => {
    const map: Record<string, string> = {};
    stores.forEach((s: any) => { map[s.store_id] = s.name; });
    return map;
  }, [stores]);

  const resetForm = () => {
    setName(''); setRole('kitchen'); setLoginCode(''); setPassword('');
    setStoreId(''); setClusterIds([]); setSubmitting(false);
  };
  const closeModal = () => { setShowModal(false); setCreatedCreds(null); setCopied(false); resetForm(); };

  const codeValid = LOGIN_CODE_RE.test(loginCode);
  const roleNeedsStore = role !== 'area_manager';
  const assignmentOk = roleNeedsStore ? !!storeId : clusterIds.length > 0;
  const canSubmit = !!name.trim() && codeValid && password.length >= 8 && assignmentOk && !submitting;

  const toggleCluster = (id: string) => {
    setClusterIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const body: any = { name: name.trim(), role, login_code: loginCode, password };
    if (role === 'area_manager') body.cluster_store_ids = clusterIds;
    else body.store_id = storeId;
    try {
      const res = await api('/staff', { method: 'POST', body });
      setCreatedCreds(res); // one-time credentials panel
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyCreds = async () => {
    if (!createdCreds) return;
    const text = `Login code: ${createdCreds.login_code}\nPassword: ${createdCreds.password}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const deleteStaff = async (id: string) => {
    if (!confirm('Remove this staff member?')) return;
    try { await api(`/staff/${id}`, { method: 'DELETE' }); load(); } catch (err: any) { alert(err.message); }
  };

  const toggleActive = async (id: string, active: boolean) => {
    try { await api(`/staff/${id}`, { method: 'PUT', body: { is_active: !active } }); load(); } catch {}
  };

  const assignmentLabel = (s: any) => {
    if (s.role === 'area_manager') {
      const n = (s.cluster_store_ids || []).length;
      return `${n} store${n === 1 ? '' : 's'}`;
    }
    return storeName[s.store_id] || s.store_id || '-';
  };

  return (
    <div>
      <div className="page-header">
        <div><h1>Staff Management</h1><p>{staff.length} members</p></div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="add-staff-btn">+ Add Staff</button>
      </div>

      <table className="data-table">
        <thead><tr><th>Name</th><th>Role</th><th>Login Code</th><th>Store / Cluster</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.id}>
              <td style={{fontWeight:600}}>{s.name}</td>
              <td><span className={`badge ${roleBadge(s.role)}`}>{roleLabel(s.role)}</span></td>
              <td style={{fontFamily:'monospace',letterSpacing:1}}>{s.login_code || '-'}</td>
              <td>{assignmentLabel(s)}</td>
              <td><span className={`badge ${s.is_active?'badge-green':'badge-gray'}`}>{s.is_active?'Active':'Inactive'}</span></td>
              <td>
                <div style={{display:'flex',gap:6}}>
                  <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(s.id, s.is_active)} data-testid={`toggle-staff-${s.id}`}>{s.is_active?'Disable':'Enable'}</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteStaff(s.id)} data-testid={`delete-staff-${s.id}`}>Remove</button>
                </div>
              </td>
            </tr>
          ))}
          {staff.length === 0 && <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#9C9C9C'}}>No staff yet. Add your first team member.</td></tr>}
        </tbody>
      </table>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            {createdCreds ? (
              // ===== One-time credentials panel =====
              <div>
                <h2>Staff created</h2>
                <p style={{color:'#6B6A5E',marginTop:-4}}>Share these credentials now — the password cannot be retrieved again.</p>
                <div className="form-group">
                  <label>Login Code</label>
                  <input value={createdCreds.login_code} readOnly style={{fontFamily:'monospace'}} />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input value={createdCreds.password} readOnly style={{fontFamily:'monospace'}} />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={copyCreds} data-testid="copy-creds-btn">{copied ? 'Copied' : 'Copy'}</button>
                  <button type="button" className="btn btn-primary" onClick={closeModal} data-testid="creds-done-btn">Done</button>
                </div>
              </div>
            ) : (
              // ===== Create form =====
              <form onSubmit={handleCreate}>
                <h2>Add Staff</h2>

                <div className="form-group">
                  <label>Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Staff name" data-testid="staff-name-input" required />
                </div>

                <div className="form-group">
                  <label>Role</label>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {ROLES.map(r => (
                      <button key={r.key} type="button" className={`btn ${role===r.key?'btn-primary':'btn-secondary'}`} style={{flex:'1 1 40%'}} onClick={() => setRole(r.key)} data-testid={`role-${r.key}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Login Code</label>
                  <input
                    value={loginCode}
                    onChange={e => setLoginCode(e.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g,'').slice(0,32))}
                    placeholder="e.g. RIYA-CASH"
                    style={{fontFamily:'monospace'}}
                    data-testid="staff-code-input"
                    required
                  />
                  {loginCode.length > 0 && !codeValid && (
                    <p style={{color:'#C0392B',fontSize:12,marginTop:4}}>3-32 chars: start with a letter/digit, then letters, digits, dot, dash or underscore.</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Password (min 8 characters)</label>
                  <div style={{display:'flex',gap:8}}>
                    <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" data-testid="staff-password-input" style={{flex:1}} required />
                    <button type="button" className="btn btn-secondary" onClick={() => setPassword(generatePassword())} data-testid="gen-password-btn">Generate</button>
                  </div>
                </div>

                {roleNeedsStore ? (
                  <div className="form-group">
                    <label>Store</label>
                    <select value={storeId} onChange={e => setStoreId(e.target.value)} data-testid="staff-store-select" required>
                      <option value="">Select a store</option>
                      {stores.map((s: any) => (
                        <option key={s.store_id} value={s.store_id}>{s.name}</option>
                      ))}
                    </select>
                    {stores.length === 0 && <p style={{color:'#6B6A5E',fontSize:12,marginTop:4}}>No stores available yet.</p>}
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Cluster (select one or more stores)</label>
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {stores.map((s: any) => (
                        <label key={s.store_id} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
                          <input type="checkbox" checked={clusterIds.includes(s.store_id)} onChange={() => toggleCluster(s.store_id)} data-testid={`cluster-${s.store_id}`} />
                          {s.name}
                        </label>
                      ))}
                    </div>
                    {stores.length === 0 && <p style={{color:'#6B6A5E',fontSize:12,marginTop:4}}>No stores available to build a cluster yet.</p>}
                  </div>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                  <button type="submit" className="btn btn-primary" data-testid="save-staff-btn" disabled={!canSubmit}>{submitting ? 'Creating…' : 'Create Staff'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
