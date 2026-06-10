import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useStores } from '../context/StoreContext';

// Page 1 — Raw inventory item master + inward (GRN) + manual adjust.
// Roles: super_admin, area_manager, store_manager. The HQ layout renders the
// global StoreSwitcher; this page reads the selected store from useStores().

const UNITS = ['g', 'kg', 'pcs', 'L', 'ml'] as const;
type Unit = typeof UNITS[number];

interface InvItem {
  id: string;
  store_id: string;
  name: string;
  unit: string;
  category?: string | null;
  product_id?: string | null;
  qty_on_hand: number;
  avg_cost?: number;            // stripped for cashier/kitchen (defense-in-depth)
  reorder_level: number;
  shelf_life_days?: number | null;
  suppliers: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ItemForm {
  name: string;
  unit: Unit;
  category: string;
  reorder_level: string;
  shelf_life_days: string;
  suppliers: string;
  is_active: boolean;
}

interface InwardForm {
  item_id: string;
  qty: string;
  purchase_price: string;
  supplier: string;
  invoice_no: string;
  note: string;
}

const EMPTY_ITEM: ItemForm = { name: '', unit: 'g', category: '', reorder_level: '0', shelf_life_days: '', suppliers: '', is_active: true };
const EMPTY_INWARD: InwardForm = { item_id: '', qty: '', purchase_price: '', supplier: '', invoice_no: '', note: '' };

export default function HqItemMaster() {
  const { user } = useAuth();
  const { selectedStoreId, loading: storesLoading } = useStores();
  const canSeeCost = user?.role !== 'cashier' && user?.role !== 'kitchen';

  const [items, setItems] = useState<InvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // modals
  const [showItem, setShowItem] = useState(false);
  const [editing, setEditing] = useState<InvItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
  const [showInward, setShowInward] = useState(false);
  const [inwardForm, setInwardForm] = useState<InwardForm>(EMPTY_INWARD);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InvItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async (storeId: string) => {
    setLoading(true);
    setError('');
    try {
      const list: InvItem[] = await api(`/inventory/${storeId}/items`);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStoreId) load(selectedStoreId);
    else setItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(''), 4000); };

  const openCreate = () => { setEditing(null); setItemForm(EMPTY_ITEM); setShowItem(true); };
  const openEdit = (it: InvItem) => {
    setEditing(it);
    setItemForm({
      name: it.name, unit: (UNITS.includes(it.unit as Unit) ? it.unit : 'g') as Unit,
      category: it.category || '', reorder_level: String(it.reorder_level ?? 0),
      shelf_life_days: it.shelf_life_days != null ? String(it.shelf_life_days) : '',
      suppliers: (it.suppliers || []).join(', '), is_active: it.is_active,
    });
    setShowItem(true);
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    if (!itemForm.name.trim()) { setError('Name is required'); return; }
    if (!UNITS.includes(itemForm.unit)) { setError('Invalid unit'); return; }
    setSaving(true);
    setError('');
    try {
      const suppliers = itemForm.suppliers.split(',').map((s) => s.trim()).filter(Boolean);
      const base = {
        name: itemForm.name.trim(),
        unit: itemForm.unit,
        category: itemForm.category.trim() || null,
        reorder_level: Number(itemForm.reorder_level) || 0,
        shelf_life_days: itemForm.shelf_life_days === '' ? null : Number(itemForm.shelf_life_days),
        suppliers,
        is_active: itemForm.is_active,
      };
      if (editing) {
        await api(`/inventory/${selectedStoreId}/items/${editing.id}`, { method: 'PUT', body: base });
        flash('Item updated');
      } else {
        await api(`/inventory/${selectedStoreId}/items`, { method: 'POST', body: base });
        flash('Item created');
      }
      setShowItem(false);
      await load(selectedStoreId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openInward = (it?: InvItem) => { setInwardForm({ ...EMPTY_INWARD, item_id: it?.id || '' }); setShowInward(true); };
  const saveInward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    if (!inwardForm.item_id) { setError('Select an item'); return; }
    if (!(Number(inwardForm.qty) > 0)) { setError('Qty must be > 0'); return; }
    if (Number(inwardForm.purchase_price) < 0) { setError('Purchase price must be >= 0'); return; }
    setSaving(true);
    setError('');
    try {
      const updated: InvItem = await api(`/inventory/${selectedStoreId}/inward`, {
        method: 'POST',
        body: {
          item_id: inwardForm.item_id,
          qty: Number(inwardForm.qty),
          purchase_price: Number(inwardForm.purchase_price),
          supplier: inwardForm.supplier.trim() || null,
          invoice_no: inwardForm.invoice_no.trim() || null,
          note: inwardForm.note.trim() || null,
        },
      });
      const costPart = canSeeCost && updated.avg_cost != null ? `, avg cost ₹${updated.avg_cost}` : '';
      flash(`Inward recorded — ${updated.name}: ${updated.qty_on_hand} ${updated.unit}${costPart}`);
      setShowInward(false);
      await load(selectedStoreId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inward failed');
    } finally {
      setSaving(false);
    }
  };

  const openAdjust = (it: InvItem) => { setAdjustItem(it); setAdjustQty(String(it.qty_on_hand)); setAdjustReason(''); setShowAdjust(true); };
  const saveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId || !adjustItem) return;
    if (!adjustReason.trim()) { setError('Reason is required for an adjustment'); return; }
    setSaving(true);
    setError('');
    try {
      await api(`/inventory/${selectedStoreId}/adjust`, {
        method: 'PUT',
        body: { item_id: adjustItem.id, new_qty: Number(adjustQty), reason: adjustReason.trim() },
      });
      flash('Stock adjusted');
      setShowAdjust(false);
      await load(selectedStoreId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Adjustment failed');
    } finally {
      setSaving(false);
    }
  };

  const isLow = (it: InvItem) => it.reorder_level > 0 && it.qty_on_hand <= it.reorder_level;

  if (storesLoading) return <div className="empty-state" data-testid="im-loading">Loading…</div>;
  if (!selectedStoreId) {
    return <div className="empty-state" data-testid="im-no-store">Select a specific store from the switcher above to manage its inventory.</div>;
  }

  return (
    <div data-testid="item-master-page">
      <div className="page-header">
        <div>
          <h1>Item Master</h1>
          <p>{items.length} raw item(s) in this store</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => openInward()} data-testid="open-inward-btn">📥 Record Inward (GRN)</button>
          <button className="btn btn-primary" onClick={openCreate} data-testid="new-item-btn">➕ New item</button>
        </div>
      </div>

      {error && <div className="badge badge-red" data-testid="im-error" style={{ display: 'block', padding: 10, marginBottom: 12 }}>{error}</div>}
      {notice && <div className="badge badge-green" data-testid="im-notice" style={{ display: 'block', padding: 10, marginBottom: 12 }}>{notice}</div>}

      {loading ? (
        <div className="empty-state">Loading items…</div>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="im-empty">No inventory items in this store yet.</div>
      ) : (
        <table className="data-table" data-testid="items-table">
          <thead>
            <tr>
              <th>Name</th><th>Unit</th><th>Category</th><th>Linked product</th>
              <th>On hand</th>{canSeeCost && <th>Avg cost</th>}<th>Reorder</th><th>Active</th><th style={{ width: 150 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} data-testid={`item-row-${it.id}`}>
                <td><strong>{it.name}</strong></td>
                <td>{it.unit}</td>
                <td style={{ fontSize: 13, color: '#696969' }}>{it.category || '—'}</td>
                <td style={{ fontSize: 13 }}>{it.product_id ? <span className="badge badge-purple">linked</span> : <span style={{ color: '#9C9C9C' }}>pure raw</span>}</td>
                <td>
                  {isLow(it) && <span title="At/below reorder level" style={{ color: '#E5484D', marginRight: 6 }} data-testid={`low-dot-${it.id}`}>●</span>}
                  {it.qty_on_hand}
                </td>
                {canSeeCost && <td data-testid={`avg-cost-${it.id}`}>₹{it.avg_cost ?? 0}</td>}
                <td>{it.reorder_level}</td>
                <td><span className={`badge ${it.is_active ? 'badge-green' : 'badge-gray'}`}>{it.is_active ? 'active' : 'inactive'}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(it)} data-testid={`edit-item-${it.id}`}>Edit</button>
                    <button className="btn btn-sm btn-secondary" onClick={() => openAdjust(it)} data-testid={`adjust-item-${it.id}`}>Adjust</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* New / edit item modal */}
      {showItem && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setShowItem(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2>{editing ? `Edit ${editing.name}` : 'New Item'}</h2>
            <form onSubmit={saveItem}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Name *</label><input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required data-testid="item-name" /></div>
                <div className="form-group"><label>Unit *</label>
                  <select value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value as Unit })} data-testid="item-unit">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Category</label><input value={itemForm.category} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })} data-testid="item-category" /></div>
                <div className="form-group"><label>Reorder level</label><input type="number" step="any" value={itemForm.reorder_level} onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })} data-testid="item-reorder" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Shelf life (days)</label><input type="number" value={itemForm.shelf_life_days} onChange={(e) => setItemForm({ ...itemForm, shelf_life_days: e.target.value })} data-testid="item-shelf" /></div>
                <div className="form-group"><label>Active</label>
                  <select value={itemForm.is_active ? 'yes' : 'no'} onChange={(e) => setItemForm({ ...itemForm, is_active: e.target.value === 'yes' })} data-testid="item-active">
                    <option value="yes">Active</option><option value="no">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Suppliers (comma-separated)</label><input value={itemForm.suppliers} onChange={(e) => setItemForm({ ...itemForm, suppliers: e.target.value })} data-testid="item-suppliers" /></div>
              {editing && <p style={{ fontSize: 12, color: '#9C9C9C' }}>On-hand qty and avg cost change only via Inward / Adjust.</p>}
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowItem(false)} data-testid="item-cancel">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="item-save">{saving ? 'Saving…' : (editing ? 'Update item' : 'Create item')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inward modal */}
      {showInward && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setShowInward(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2>Record Inward (GRN)</h2>
            <form onSubmit={saveInward}>
              <div className="form-group"><label>Item *</label>
                <select value={inwardForm.item_id} onChange={(e) => setInwardForm({ ...inwardForm, item_id: e.target.value })} required data-testid="inward-item">
                  <option value="">— select item —</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Qty *</label><input type="number" step="any" value={inwardForm.qty} onChange={(e) => setInwardForm({ ...inwardForm, qty: e.target.value })} required data-testid="inward-qty" /></div>
                <div className="form-group"><label>Purchase price (₹/unit) *</label><input type="number" step="any" value={inwardForm.purchase_price} onChange={(e) => setInwardForm({ ...inwardForm, purchase_price: e.target.value })} required data-testid="inward-price" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label>Supplier</label><input value={inwardForm.supplier} onChange={(e) => setInwardForm({ ...inwardForm, supplier: e.target.value })} data-testid="inward-supplier" /></div>
                <div className="form-group"><label>Invoice no.</label><input value={inwardForm.invoice_no} onChange={(e) => setInwardForm({ ...inwardForm, invoice_no: e.target.value })} data-testid="inward-invoice" /></div>
              </div>
              <div className="form-group"><label>Note</label><input value={inwardForm.note} onChange={(e) => setInwardForm({ ...inwardForm, note: e.target.value })} data-testid="inward-note" /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowInward(false)} data-testid="inward-cancel">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="inward-save">{saving ? 'Saving…' : 'Record inward'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {showAdjust && adjustItem && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !saving && setShowAdjust(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h2>Adjust — {adjustItem.name}</h2>
            <form onSubmit={saveAdjust}>
              <p style={{ fontSize: 13, color: '#696969' }}>Current on hand: <strong>{adjustItem.qty_on_hand} {adjustItem.unit}</strong></p>
              <div className="form-group"><label>New qty *</label><input type="number" step="any" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} required data-testid="adjust-qty" /></div>
              <div className="form-group"><label>Reason *</label><input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} required data-testid="adjust-reason" /></div>
              <p style={{ fontSize: 12, color: '#9C9C9C' }}>Large variance (≥ ₹2000) needs area manager / HQ.</p>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjust(false)} data-testid="adjust-cancel">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving} data-testid="adjust-save">{saving ? 'Saving…' : 'Apply adjustment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
