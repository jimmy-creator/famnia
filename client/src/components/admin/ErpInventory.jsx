/**
 * ERP → Inventory: Locations, per-location stock, and Stock Transfers.
 *
 * Lifted out of Admin.jsx when the ERP surface moved to its own page; the
 * tab markup is unchanged.  The location and product lists are owned by
 * Erp.jsx because most ERP tabs need them, so they arrive as props —
 * everything only these three tabs touch is state here.
 */
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { HiPlus, HiPencil, HiTrash, HiX } from 'react-icons/hi';
import api from '../../api/axios';

export default function ErpInventory({ tab, setTab, locations, setLocations, products, setProducts }) {
  const [locationForm, setLocationForm] = useState(null);
  const [invProductId, setInvProductId] = useState(null);   // product whose per-location grid is open
  const [invDetail, setInvDetail] = useState(null);          // { product, locations, stocks }
  const [invDraft, setInvDraft] = useState({});              // key `${variantIdx ?? 'b'}:${locationId}` → quantity string
  const [invBusy, setInvBusy] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [transferForm, setTransferForm] = useState(null);    // new-transfer modal state
  const [transferStatusFilter, setTransferStatusFilter] = useState('');
  // Own search box — the Products tab it used to share one with now lives
  // on a different page.
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    if (tab !== 'transfers') return;
    const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
    api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data)).catch(() => {});
  }, [tab, transferStatusFilter]);

  return (
    <>
    {tab === 'locations' && (
      <div>
        <button
          className="btn btn-primary"
          onClick={() => setLocationForm({ name: '', code: '', type: 'store', address: '', phone: '', isOnlineDefault: false, sortOrder: 0, _editing: false })}
          style={{ marginBottom: '1.5rem' }}
        >
          <HiPlus /> Add Location
        </button>

        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Address</th>
                <th>Online default</th>
                <th>Active</th>
                <th>Edit</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No locations yet — add your first store</td></tr>
              )}
              {locations.map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.name}</strong></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{l.code || '—'}</td>
                  <td>{l.type}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 280 }}>{l.address || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {l.isOnlineDefault ? <span style={{ color: 'var(--success)' }}>✓ default</span> : (
                      <button className="invoice-btn" style={{ fontSize: '0.7rem' }}
                        onClick={async () => {
                          try {
                            await api.post(`/locations/${l.id}/set-online-default`);
                            api.get('/locations').then((res) => setLocations(res.data));
                            toast.success('Marked as online default');
                          } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                        }}>Set</button>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>{l.active ? '✓' : '—'}</td>
                  <td>
                    <button className="icon-btn" onClick={() => setLocationForm({ ...l, _editing: true })}><HiPencil /></button>
                  </td>
                  <td>
                    <button className="icon-btn danger" onClick={async () => {
                      if (!confirm(`Delete "${l.name}"?`)) return;
                      try {
                        await api.delete(`/locations/${l.id}`);
                        setLocations(locations.filter((x) => x.id !== l.id));
                        toast.success('Deleted');
                      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                    }}><HiTrash /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {locationForm && (
          <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setLocationForm(null); }}>
            <form className="admin-form" onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (locationForm._editing) {
                  await api.patch(`/locations/${locationForm.id}`, locationForm);
                  toast.success('Location updated');
                } else {
                  await api.post('/locations', locationForm);
                  toast.success('Location created');
                }
                setLocationForm(null);
                api.get('/locations').then((res) => setLocations(res.data));
              } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
            }}>
              <h3>{locationForm._editing ? 'Edit Location' : 'New Location'}</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Code (short, for receipts)</label>
                  <input value={locationForm.code || ''} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })} placeholder="YAAL" maxLength={20} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Type</label>
                  <select value={locationForm.type} onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value })}>
                    <option value="store">Store</option>
                    <option value="warehouse">Warehouse</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Sort order</label>
                  <input type="number" value={locationForm.sortOrder || 0} onChange={(e) => setLocationForm({ ...locationForm, sortOrder: parseInt(e.target.value, 10) || 0 })} />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input value={locationForm.address || ''} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={locationForm.phone || ''} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={!!locationForm.isOnlineDefault} onChange={(e) => setLocationForm({ ...locationForm, isOnlineDefault: e.target.checked })} />
                  Online fulfilment default — online orders decrement this location's stock
                </label>
              </div>
              {locationForm._editing && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={!!locationForm.active} onChange={(e) => setLocationForm({ ...locationForm, active: e.target.checked })} />
                    Active
                  </label>
                </div>
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">{locationForm._editing ? 'Save' : 'Create'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setLocationForm(null)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    )}

    {tab === 'inventory' && (
      <div>
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search products to view per-location stock"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            style={{ flex: 1, minWidth: 240, padding: '0.55rem 0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
          />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{locations.length} location{locations.length === 1 ? '' : 's'}</span>
        </div>

        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Code</th>
                <th>Variants</th>
                <th>Total stock</th>
                <th>Per location</th>
              </tr>
            </thead>
            <tbody>
              {products
                .filter((p) => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code?.toLowerCase().includes(productSearch.toLowerCase()))
                .slice(0, 100)
                .map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.code || `P${p.id}`}</td>
                    <td style={{ textAlign: 'center' }}>{Array.isArray(p.variants) ? p.variants.length : '—'}</td>
                    <td><strong>{p.stock}</strong></td>
                    <td>
                      <button className="invoice-btn" onClick={async () => {
                        try {
                          setInvProductId(p.id);
                          const { data } = await api.get(`/inventory/product/${p.id}`);
                          setInvDetail(data);
                          // Seed the draft with existing values so the inputs are controlled.
                          const draft = {};
                          const variantRows = Array.isArray(data.product.variants) && data.product.variants.length > 0
                            ? data.product.variants.map((_, idx) => idx)
                            : [null];
                          for (const vIdx of variantRows) {
                            for (const loc of data.locations) {
                              const existing = data.stocks.find((s) =>
                                s.locationId === loc.id &&
                                (s.variantIndex === vIdx || (s.variantIndex == null && vIdx == null))
                              );
                              draft[`${vIdx ?? 'b'}:${loc.id}`] = String(existing?.quantity ?? 0);
                            }
                          }
                          setInvDraft(draft);
                        } catch (err) { toast.error(err.response?.data?.message || 'Failed to load'); }
                      }}>Open</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {invProductId && invDetail && (() => {
          const variantRows = Array.isArray(invDetail.product.variants) && invDetail.product.variants.length > 0
            ? invDetail.product.variants.map((v, idx) => ({ idx, label: Object.values(v.options || {}).join(' / ') || `Variant ${idx + 1}` }))
            : [{ idx: null, label: '— (no variants)' }];
          // Build the diff between draft and persisted stocks so the Save button knows what to send.
          const changes = [];
          for (const row of variantRows) {
            for (const l of invDetail.locations) {
              const k = `${row.idx ?? 'b'}:${l.id}`;
              const draftVal = invDraft[k];
              if (draftVal === undefined) continue;
              const existing = invDetail.stocks.find((s) =>
                s.locationId === l.id &&
                (s.variantIndex === row.idx || (s.variantIndex == null && row.idx == null))
              );
              const oldQty = existing?.quantity ?? 0;
              const newQty = parseInt(draftVal, 10);
              if (!isNaN(newQty) && newQty !== oldQty && newQty >= 0) {
                changes.push({ productId: invDetail.product.id, variantIndex: row.idx, locationId: l.id, quantity: newQty });
              }
            }
          }
          const closeModal = () => { setInvProductId(null); setInvDetail(null); setInvDraft({}); };
          return (
            <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
              <div className="admin-form" style={{ maxWidth: 720 }}>
                <h3>Stock — {invDetail.product.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Total: <strong>{invDetail.product.stock}</strong> across {invDetail.locations.length} location{invDetail.locations.length === 1 ? '' : 's'}
                  {changes.length > 0 && <> · <span style={{ color: 'var(--copper, #c4784a)' }}>{changes.length} unsaved change{changes.length === 1 ? '' : 's'}</span></>}
                </p>

                {invDetail.locations.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)' }}>
                    No active locations. Create at least one in the <button type="button" className="invoice-btn" onClick={() => { closeModal(); setTab('locations'); }}>Locations</button> tab first.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '0.5rem', textAlign: 'left' }}>Variant</th>
                        {invDetail.locations.map((l) => (
                          <th key={l.id} style={{ padding: '0.5rem', textAlign: 'center', minWidth: 100 }}>{l.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {variantRows.map((row) => (
                        <tr key={row.idx ?? 'base'} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '0.5rem' }}>{row.label}</td>
                          {invDetail.locations.map((l) => {
                            const k = `${row.idx ?? 'b'}:${l.id}`;
                            const existing = invDetail.stocks.find((s) =>
                              s.locationId === l.id &&
                              (s.variantIndex === row.idx || (s.variantIndex == null && row.idx == null))
                            );
                            const oldQty = existing?.quantity ?? 0;
                            const currentDraft = invDraft[k] ?? String(oldQty);
                            const dirty = parseInt(currentDraft, 10) !== oldQty && currentDraft !== '';
                            return (
                              <td key={l.id} style={{ padding: '0.5rem', textAlign: 'center' }}>
                                <input
                                  type="number"
                                  min={0}
                                  value={currentDraft}
                                  disabled={invBusy}
                                  onChange={(e) => setInvDraft({ ...invDraft, [k]: e.target.value })}
                                  style={{
                                    width: 70, padding: '0.3rem 0.4rem',
                                    border: `1px solid ${dirty ? 'var(--copper, #c4784a)' : 'var(--border)'}`,
                                    borderRadius: 4, textAlign: 'center',
                                    background: dirty ? 'rgba(196, 120, 74, 0.06)' : 'transparent',
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="form-actions" style={{ marginTop: '1.25rem' }}>
                  <button type="button" className="btn btn-primary" disabled={invBusy || changes.length === 0}
                    onClick={async () => {
                      setInvBusy(true);
                      try {
                        await api.post('/inventory/adjust-bulk', { items: changes });
                        toast.success(`Saved ${changes.length} change${changes.length === 1 ? '' : 's'}`);
                        const { data } = await api.get(`/inventory/product/${invDetail.product.id}`);
                        setInvDetail(data);
                        setInvDraft({});
                        api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
                      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                      finally { setInvBusy(false); }
                    }}>
                    {invBusy ? 'Saving…' : `Save ${changes.length || ''} changes`.trim()}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    )}

    {tab === 'transfers' && (
      <div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn btn-primary"
            onClick={() => setTransferForm({ fromLocationId: '', toLocationId: '', items: [], notes: '' })}>
            <HiPlus /> New Transfer
          </button>
          <label style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status:</label>
          <select value={transferStatusFilter} onChange={(e) => setTransferStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="in_transit">In transit</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-light)' }}>{transfers.length} transfer{transfers.length === 1 ? '' : 's'}</span>
        </div>

        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>From → To</th>
                <th>Items</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No transfers</td></tr>}
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{t.transferNumber}</td>
                  <td>{t.fromLocation?.name} → {t.toLocation?.name}</td>
                  <td>{Array.isArray(t.items) ? t.items.length : 0}</td>
                  <td>
                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: 4,
                      background: t.status === 'completed' ? 'rgba(34,197,94,0.15)' : t.status === 'in_transit' ? 'rgba(59,130,246,0.15)' : t.status === 'pending' ? 'rgba(250,204,21,0.18)' : 'rgba(148,163,184,0.15)',
                      color: t.status === 'completed' ? '#15803d' : t.status === 'in_transit' ? '#1d4ed8' : t.status === 'pending' ? '#a16207' : '#475569' }}>{t.status}</span>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td>
                    {t.status === 'pending' && (
                      <button className="invoice-btn" style={{ fontSize: '0.7rem' }} onClick={async () => {
                        try {
                          await api.post(`/stock-transfers/${t.id}/dispatch`);
                          toast.success('Dispatched — source decremented');
                          const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                          api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                      }}>Dispatch</button>
                    )}
                    {t.status === 'in_transit' && (
                      <button className="invoice-btn" style={{ fontSize: '0.7rem' }} onClick={async () => {
                        try {
                          await api.post(`/stock-transfers/${t.id}/complete`);
                          toast.success('Completed — destination incremented');
                          const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                          api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                      }}>Complete</button>
                    )}
                    {(t.status === 'pending' || t.status === 'in_transit') && (
                      <button className="icon-btn danger" style={{ fontSize: '0.7rem', marginLeft: '0.3rem' }} title="Cancel" onClick={async () => {
                        if (!confirm(`Cancel transfer ${t.transferNumber}?`)) return;
                        try {
                          await api.post(`/stock-transfers/${t.id}/cancel`);
                          toast.success('Cancelled');
                          const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                          api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                      }}><HiX /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {transferForm && (
          <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setTransferForm(null); }}>
            <div className="admin-form" style={{ maxWidth: 720 }}>
              <h3>New Stock Transfer</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>From</label>
                  <select value={transferForm.fromLocationId} onChange={(e) => setTransferForm({ ...transferForm, fromLocationId: e.target.value })} required>
                    <option value="">Select…</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>To</label>
                  <select value={transferForm.toLocationId} onChange={(e) => setTransferForm({ ...transferForm, toLocationId: e.target.value })} required>
                    <option value="">Select…</option>
                    {locations.filter((l) => String(l.id) !== String(transferForm.fromLocationId)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Items</label>
                {transferForm.items.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>No items yet — add below.</p>}
                {transferForm.items.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                    <select
                      value={it.productId || ''}
                      onChange={(e) => {
                        const p = products.find((x) => x.id === parseInt(e.target.value, 10));
                        const items = [...transferForm.items];
                        items[idx] = { ...items[idx], productId: parseInt(e.target.value, 10), name: p?.name, variantIndex: null };
                        setTransferForm({ ...transferForm, items });
                      }}
                      style={{ flex: 1, padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
                    >
                      <option value="">Pick product…</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {(() => {
                      const p = products.find((x) => x.id === it.productId);
                      if (!p || !Array.isArray(p.variants) || p.variants.length === 0) return null;
                      return (
                        <select
                          value={it.variantIndex ?? ''}
                          onChange={(e) => {
                            const items = [...transferForm.items];
                            items[idx] = { ...items[idx], variantIndex: e.target.value === '' ? null : parseInt(e.target.value, 10) };
                            setTransferForm({ ...transferForm, items });
                          }}
                          style={{ width: 140, padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
                        >
                          <option value="">All variants</option>
                          {p.variants.map((v, i) => <option key={i} value={i}>{Object.values(v.options || {}).join('/')}</option>)}
                        </select>
                      );
                    })()}
                    <input type="number" min={1} value={it.quantity || ''} placeholder="Qty"
                      onChange={(e) => {
                        const items = [...transferForm.items];
                        items[idx] = { ...items[idx], quantity: parseInt(e.target.value, 10) || 0 };
                        setTransferForm({ ...transferForm, items });
                      }}
                      style={{ width: 80, padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: 4 }} />
                    <button type="button" className="icon-btn danger" onClick={() => setTransferForm({ ...transferForm, items: transferForm.items.filter((_, i) => i !== idx) })}><HiX /></button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                  onClick={() => setTransferForm({ ...transferForm, items: [...transferForm.items, { productId: null, variantIndex: null, quantity: 1 }] })}>
                  <HiPlus /> Add item
                </button>
              </div>

              <div className="form-group">
                <label>Notes (optional)</label>
                <textarea rows={2} value={transferForm.notes || ''} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={async () => {
                  try {
                    await api.post('/stock-transfers', transferForm);
                    toast.success('Transfer created (pending)');
                    setTransferForm(null);
                    const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                    api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                  } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                }}>Create transfer</button>
                <button type="button" className="btn btn-secondary" onClick={() => setTransferForm(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </>
  );
}
