import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useStores } from '../context/StoreContext';

// ============================================================================
// Store onboarding pipeline + go-live gate (UI-5, Page 7). super_admin only
// (route-gated). 5 ordered steps: created → catalog_priced → staff_assigned →
// compliance_done → live. Go-live is HARD-gated on GST + FSSAI compliance.
// Reuses api()/useStores() + existing CSS.
// Endpoints (Step-0 confirmed):
//   GET  /stores/onboarding/pending
//   GET  /stores/{id}/onboarding
//   POST /stores/{id}/onboarding/advance  { accept_master_prices }
//   POST /stores/{id}/go-live
// ============================================================================

const ORDER = ['created', 'catalog_priced', 'staff_assigned', 'compliance_done', 'live'] as const;
type Step = (typeof ORDER)[number];
const STEP_LABEL: Record<Step, string> = {
  created: 'Created',
  catalog_priced: 'Catalog Priced',
  staff_assigned: 'Staff Assigned',
  compliance_done: 'Compliance Done',
  live: 'Live',
};

type PendingStore = { store_id: string; name: string; code?: string; onboarding_status: Step };
type ChecklistItem = { step: Step; done: boolean; detail: string | null };
type OnboardingResp = { store_id: string; onboarding_status: Step; checklist: ChecklistItem[] };

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export default function HqOnboarding() {
  const { stores, reload: reloadStores } = useStores();

  const [pending, setPending] = useState<PendingStore[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OnboardingResp | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [acceptMaster, setAcceptMaster] = useState(false);
  const [busy, setBusy] = useState('');

  const loadPending = useCallback(async () => {
    setLoadingList(true);
    setListError('');
    try {
      const list: PendingStore[] = await api('/stores/onboarding/pending');
      setPending(list);
      setSelectedId((prev) => (prev && list.some((s) => s.store_id === prev) ? prev : list[0]?.store_id ?? null));
    } catch (e) {
      setListError(errMsg(e));
      setPending([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (sid: string) => {
    setLoadingDetail(true);
    setDetailError('');
    setAcceptMaster(false);
    try {
      const data: OnboardingResp = await api(`/stores/${sid}/onboarding`);
      setDetail(data);
    } catch (e) {
      setDetailError(errMsg(e));
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);

  // Compliance fields live on the store record (from the role-scoped /stores list).
  const selectedStore = stores.find((s) => s.store_id === selectedId) || null;
  const gst = (selectedStore?.gst_no || '').trim();
  const fssai = (selectedStore?.fssai_license || '').trim();
  const complianceComplete = !!gst && !!fssai;

  const status: Step | null = detail?.onboarding_status ?? null;
  const statusIdx = status ? ORDER.indexOf(status) : -1;
  const atCompliance = status === 'compliance_done';
  const isLive = status === 'live';
  // Next step is "live" once we reach compliance_done -> that transition uses go-live.
  const canAdvance = !isLive && statusIdx >= 0 && ORDER[statusIdx + 1] !== 'live';
  const advancingToCatalog = status === 'created';

  const advance = async () => {
    if (!selectedId) return;
    setBusy('advance');
    setDetailError('');
    try {
      await api(`/stores/${selectedId}/onboarding/advance`, {
        method: 'POST',
        body: { accept_master_prices: advancingToCatalog ? acceptMaster : false },
      });
      await loadDetail(selectedId);
      await loadPending();
    } catch (e) {
      setDetailError(errMsg(e)); // surfaces 400 gate failures inline
    } finally {
      setBusy('');
    }
  };

  const goLive = async () => {
    if (!selectedId) return;
    setBusy('golive');
    setDetailError('');
    try {
      await api(`/stores/${selectedId}/go-live`, { method: 'POST' });
      await loadPending();      // store drops out of the pending queue
      await reloadStores();
      setSelectedId(null);
      setDetail(null);
    } catch (e) {
      setDetailError(errMsg(e)); // backend 400 if compliance slipped through
    } finally {
      setBusy('');
    }
  };

  const storeLabel = (s: PendingStore) => s.name || s.store_id.slice(0, 8);

  return (
    <div data-testid="onboarding-page">
      <div className="page-header">
        <div><h1>Store Onboarding</h1><p>Pipeline &amp; go-live gating</p></div>
        <button className="btn btn-secondary" data-testid="refresh-onboarding-btn" onClick={() => { loadPending(); if (selectedId) loadDetail(selectedId); }}>Refresh</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Pending queue */}
        <div>
          <h2 style={{ fontSize: 16 }}>Pending stores</h2>
          {listError && <div className="badge badge-red" style={{ display: 'block', padding: 10, marginBottom: 10 }} data-testid="onboarding-list-error">{listError}</div>}
          {loadingList ? (
            <div style={{ padding: 20, color: '#9C9C9C' }} data-testid="onboarding-list-loading">Loading…</div>
          ) : pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9C9C9C' }} data-testid="onboarding-empty">All stores are live 🎉</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }} data-testid="onboarding-queue">
              {pending.map((s) => (
                <button
                  key={s.store_id}
                  data-testid={`onboarding-row-${s.store_id}`}
                  onClick={() => setSelectedId(s.store_id)}
                  style={{
                    textAlign: 'left', padding: 12, borderRadius: 10, cursor: 'pointer',
                    background: selectedId === s.store_id ? 'var(--lime)' : '#FAFAFA',
                    border: `1px solid ${selectedId === s.store_id ? 'var(--ink)' : '#EFEFEF'}`,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{storeLabel(s)}</div>
                  <div style={{ fontSize: 12, color: '#696969', marginTop: 2 }}>
                    {s.code ? `${s.code} · ` : ''}<span className="badge badge-gray">{STEP_LABEL[s.onboarding_status] || s.onboarding_status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail / stepper */}
        <div>
          {!selectedId ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9C9C9C' }} data-testid="onboarding-no-selection">Select a store to view its onboarding pipeline.</div>
          ) : loadingDetail ? (
            <div style={{ padding: 20, color: '#9C9C9C' }} data-testid="onboarding-detail-loading">Loading…</div>
          ) : detailError && !detail ? (
            <div className="badge badge-red" style={{ display: 'block', padding: 12 }} data-testid="onboarding-detail-error">{detailError}</div>
          ) : detail ? (
            <div data-testid="onboarding-detail">
              <h2 style={{ fontSize: 18, marginBottom: 4 }}>{selectedStore?.name || detail.store_id}</h2>
              <div style={{ marginBottom: 18 }}>
                <span className={`badge ${isLive ? 'badge-green' : 'badge-orange'}`} data-testid="onboarding-status">{STEP_LABEL[detail.onboarding_status] || detail.onboarding_status}</span>
              </div>

              {/* 5-step stepper */}
              <div data-testid="onboarding-stepper" style={{ display: 'grid', gap: 0, marginBottom: 20 }}>
                {detail.checklist.map((c, i) => {
                  const isCurrent = c.step === detail.onboarding_status;
                  return (
                    <div key={c.step} data-testid={`step-${c.step}`} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700,
                          background: c.done ? 'var(--success)' : isCurrent ? 'var(--lime)' : '#ECE8DC',
                          color: c.done ? '#fff' : 'var(--ink)',
                        }}>{c.done ? '✓' : i + 1}</div>
                        {i < detail.checklist.length - 1 && <div style={{ width: 2, height: 26, background: c.done ? 'var(--success)' : '#ECE8DC' }} />}
                      </div>
                      <div style={{ paddingBottom: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {STEP_LABEL[c.step]} {isCurrent && <span className="badge badge-purple" style={{ marginLeft: 6 }}>current</span>}
                        </div>
                        {c.detail && <div style={{ fontSize: 13, color: c.done ? '#696969' : '#9A6E1E', marginTop: 2 }} data-testid={`step-detail-${c.step}`}>{c.detail}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {detailError && <div className="badge badge-red" style={{ display: 'block', padding: 10, marginBottom: 12 }} data-testid="onboarding-action-error">{detailError}</div>}

              {/* Actions */}
              {isLive ? (
                <div className="badge badge-green" style={{ display: 'inline-block', padding: 10 }} data-testid="onboarding-live-note">This store is live.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {canAdvance && (
                    <div>
                      {advancingToCatalog && (
                        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
                          <input type="checkbox" checked={acceptMaster} onChange={(e) => setAcceptMaster(e.target.checked)} data-testid="accept-master-prices" />
                          Accept master prices (no per-store overrides)
                        </label>
                      )}
                      <button className="btn btn-primary" data-testid="advance-btn" disabled={busy !== ''} onClick={advance}>
                        {busy === 'advance' ? 'Advancing…' : `Advance to ${STEP_LABEL[ORDER[statusIdx + 1]]}`}
                      </button>
                    </div>
                  )}

                  <div>
                    <button className="btn btn-green" data-testid="go-live-btn" disabled={!complianceComplete || busy !== ''} onClick={goLive}>
                      {busy === 'golive' ? 'Going live…' : '🚀 Go Live'}
                    </button>
                    {!complianceComplete && (
                      <div style={{ color: 'var(--error)', fontSize: 13, marginTop: 6 }} data-testid="compliance-warning">
                        Compliance incomplete — set GST + FSSAI in Stores &amp; Clusters first
                      </div>
                    )}
                    {complianceComplete && !atCompliance && (
                      <div style={{ color: '#9C9C9C', fontSize: 12, marginTop: 6 }} data-testid="golive-hint">
                        Compliance OK. Going live finalizes onboarding.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
