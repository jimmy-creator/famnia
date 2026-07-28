/**
 * Finance tabs — Cash Accounts, Expenses, Cash Transfers, Daily Cash.
 *
 * Lifted out of Admin.jsx because each tab carries its own table +
 * form modal and inlining them all would push the file past 5000
 * lines.  State stays in the parent and is passed in so cross-tab
 * concerns (e.g. opening a transfer from a cash-account row) can
 * coordinate later without refactoring.
 */
import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiPlus, HiPencil, HiTrash } from 'react-icons/hi';
import api from '../../api/axios';

export default function FinanceTabs(props) {
  const { tab } = props;
  if (tab === 'cash-accounts') return <CashAccountsTab {...props} />;
  if (tab === 'expenses') return <ExpensesTab {...props} />;
  if (tab === 'cash-transfers') return <CashTransfersTab {...props} />;
  if (tab === 'daily-cash') return <DailyCashTab {...props} />;
  if (tab === 'daybook') return <DaybookTab {...props} />;
  if (tab === 'pnl') return <PnlTab {...props} />;
  if (tab === 'stock-value') return <StockValueTab {...props} />;
  return null;
}

const ACCT_TYPE_LABEL = {
  drawer: 'Cash drawer', petty_cash: 'Petty cash', bank: 'Bank',
  card_terminal: 'Card terminal', knet_terminal: 'KNET terminal', other: 'Other',
};

// ─── Cash Accounts ─────────────────────────────────────────────────
function CashAccountsTab({ currency, locations, cashAccounts, setCashAccounts, cashAccountForm, setCashAccountForm }) {
  const refresh = () => api.get('/finance/cash-accounts').then((r) => setCashAccounts(r.data));

  const totalsByType = cashAccounts.reduce((m, a) => {
    if (!a.active) return m;
    m[a.type] = (m[a.type] || 0) + parseFloat(a.balance || 0);
    return m;
  }, {});

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Cash Accounts</h2>
        <button className="btn btn-primary" onClick={() => setCashAccountForm({ name: '', code: '', type: 'drawer', locationId: '', openingBalance: 0, notes: '', active: true, _editing: false })}>
          <HiPlus /> Add Account
        </button>
      </div>

      <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {['drawer', 'card_terminal', 'knet_terminal', 'petty_cash', 'bank'].map((t) => (
          <div key={t} className="dash-card">
            <div className="dash-card-label">{ACCT_TYPE_LABEL[t]} total</div>
            <div className="dash-card-value">{currency}{(totalsByType[t] || 0).toFixed(3)}</div>
          </div>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>Type</th><th>Location</th><th style={{ textAlign: 'right' }}>Opening</th><th style={{ textAlign: 'right' }}>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {cashAccounts.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No accounts</td></tr>}
            {cashAccounts.map((a) => (
              <tr key={a.id} style={{ opacity: a.active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td style={{ textTransform: 'capitalize' }}>{ACCT_TYPE_LABEL[a.type] || a.type}</td>
                <td>{a.Location?.name || '—'}</td>
                <td style={{ textAlign: 'right' }}>{currency}{parseFloat(a.openingBalance || 0).toFixed(3)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: a.balance < 0 ? 'var(--danger)' : 'inherit' }}>{currency}{parseFloat(a.balance || 0).toFixed(3)}</td>
                <td>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                    background: a.active ? 'rgba(90,138,106,0.15)' : 'rgba(100,116,139,0.15)',
                    color: a.active ? 'var(--success)' : 'var(--text-light)' }}>{a.active ? 'ACTIVE' : 'INACTIVE'}</span>
                </td>
                <td style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="icon-btn" onClick={() => setCashAccountForm({ ...a, _editing: true })}><HiPencil /></button>
                  <button className="icon-btn" onClick={async () => {
                    if (!confirm('Delete account?')) return;
                    try { await api.delete(`/finance/cash-accounts/${a.id}`); refresh(); }
                    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                  }}><HiTrash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cashAccountForm && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCashAccountForm(null); }}>
          <form className="admin-form" style={{ maxWidth: 520 }} onSubmit={async (e) => {
            e.preventDefault();
            try {
              const body = { ...cashAccountForm };
              delete body._editing; delete body.balance; delete body.Location;
              if (!body.locationId) body.locationId = null;
              if (cashAccountForm._editing) await api.put(`/finance/cash-accounts/${cashAccountForm.id}`, body);
              else await api.post('/finance/cash-accounts', body);
              toast.success('Saved');
              setCashAccountForm(null);
              refresh();
            } catch (err) {
              toast.error(err.response?.data?.message || 'Failed');
            }
          }}>
            <h3>{cashAccountForm._editing ? 'Edit Cash Account' : 'New Cash Account'}</h3>
            <div className="form-row">
              <div className="form-group"><label>Name *</label>
                <input value={cashAccountForm.name} onChange={(e) => setCashAccountForm({ ...cashAccountForm, name: e.target.value })} required /></div>
              <div className="form-group"><label>Code</label>
                <input value={cashAccountForm.code || ''} onChange={(e) => setCashAccountForm({ ...cashAccountForm, code: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Type</label>
                <select value={cashAccountForm.type} onChange={(e) => setCashAccountForm({ ...cashAccountForm, type: e.target.value })}>
                  <option value="drawer">Cash drawer</option>
                  <option value="petty_cash">Petty cash</option>
                  <option value="bank">Bank</option>
                  <option value="card_terminal">Card terminal</option>
                  <option value="knet_terminal">KNET terminal</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group"><label>Location (optional)</label>
                <select value={cashAccountForm.locationId || ''} onChange={(e) => setCashAccountForm({ ...cashAccountForm, locationId: e.target.value })}>
                  <option value="">— None —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label>Opening balance ({currency})</label>
              <input type="number" step="0.001" value={cashAccountForm.openingBalance} onChange={(e) => setCashAccountForm({ ...cashAccountForm, openingBalance: e.target.value })} />
            </div>
            <div className="form-group"><label>Notes</label>
              <textarea rows={2} value={cashAccountForm.notes || ''} onChange={(e) => setCashAccountForm({ ...cashAccountForm, notes: e.target.value })} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <input type="checkbox" checked={!!cashAccountForm.active} onChange={(e) => setCashAccountForm({ ...cashAccountForm, active: e.target.checked })} /> Active
            </label>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">{cashAccountForm._editing ? 'Save' : 'Create'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setCashAccountForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Expenses ──────────────────────────────────────────────────────
function ExpensesTab({
  currency, isAdmin, locations,
  cashAccounts, expenses, setExpenses,
  expenseFilter, setExpenseFilter,
  expenseForm, setExpenseForm,
  expenseCategories, setExpenseCategories, expenseCatForm, setExpenseCatForm,
}) {
  const [showCats, setShowCats] = useState(false);
  const refresh = () => api.get('/finance/expenses', { params: filterParams(expenseFilter) }).then((r) => setExpenses(r.data));
  const refreshCats = () => api.get('/finance/expense-categories').then((r) => setExpenseCategories(r.data));

  const totals = expenses.reduce((s, e) => {
    if (e.status === 'cancelled') return s;
    s.total += parseFloat(e.amount || 0);
    s.count += 1;
    return s;
  }, { total: 0, count: 0 });

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Expenses</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowCats((s) => !s)}>
            {showCats ? 'Hide categories' : 'Categories'}
          </button>
          <button className="btn btn-primary" onClick={() => setExpenseForm({
            expenseCategoryId: '', locationId: '', cashAccountId: '', amount: '', paymentMethod: 'cash',
            description: '', reference: '', expenseDate: new Date().toISOString().slice(0, 10), notes: '',
          })}><HiPlus /> Add Expense</button>
        </div>
      </div>

      {showCats && (
        <div style={{ padding: '1rem', background: 'var(--bg-warm, #f5f1e8)', borderRadius: 8, marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong>Expense categories</strong>
            <button className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
              onClick={() => setExpenseCatForm({ name: '', code: '', active: true, _editing: false })}>+ New category</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {expenseCategories.length === 0 && <span style={{ color: 'var(--text-light)' }}>No categories yet</span>}
            {expenseCategories.map((c) => (
              <span key={c.id} style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center', padding: '0.3rem 0.6rem', background: 'white', borderRadius: 100, fontSize: '0.82rem', border: '1px solid var(--border-light)' }}>
                {c.name}
                <button className="link-btn" onClick={() => setExpenseCatForm({ ...c, _editing: true })} style={{ fontSize: '0.78rem' }}>✎</button>
                <button className="link-btn" onClick={async () => {
                  if (!confirm('Delete category?')) return;
                  try { await api.delete(`/finance/expense-categories/${c.id}`); refreshCats(); }
                  catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                }} style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>✕</button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
        <div><label style={dlbl}>From</label><input type="date" value={expenseFilter.from} onChange={(e) => setExpenseFilter({ ...expenseFilter, from: e.target.value })} /></div>
        <div><label style={dlbl}>To</label><input type="date" value={expenseFilter.to} onChange={(e) => setExpenseFilter({ ...expenseFilter, to: e.target.value })} /></div>
        <div><label style={dlbl}>Category</label>
          <select value={expenseFilter.categoryId} onChange={(e) => setExpenseFilter({ ...expenseFilter, categoryId: e.target.value })}>
            <option value="">All</option>
            {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label style={dlbl}>Location</label>
          <select value={expenseFilter.locationId} onChange={(e) => setExpenseFilter({ ...expenseFilter, locationId: e.target.value })}>
            <option value="">All</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <button className="btn btn-secondary" onClick={() => setExpenseFilter({ from: '', to: '', categoryId: '', locationId: '' })}>Clear</button>
      </div>

      <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="dash-card"><div className="dash-card-label">Total expenses</div><div className="dash-card-value">{currency}{totals.total.toFixed(3)}</div></div>
        <div className="dash-card"><div className="dash-card-label">Entries</div><div className="dash-card-value">{totals.count}</div></div>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Location</th><th>Account</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {expenses.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No expenses</td></tr>}
            {expenses.map((e) => (
              <tr key={e.id} style={{ opacity: e.status === 'cancelled' ? 0.5 : 1 }}>
                <td style={{ fontSize: '0.82rem' }}>{new Date(e.expenseDate).toLocaleDateString()}</td>
                <td>{e.description}<div style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>{e.expenseNumber}{e.reference ? ` · ${e.reference}` : ''}</div></td>
                <td>{e.ExpenseCategory?.name || '—'}</td>
                <td>{e.Location?.name || '—'}</td>
                <td>{e.CashAccount?.name || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{parseFloat(e.amount).toFixed(3)}</td>
                <td>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                    background: e.status === 'paid' ? 'rgba(90,138,106,0.15)' : 'rgba(220,38,38,0.15)',
                    color: e.status === 'paid' ? 'var(--success)' : 'var(--danger)' }}>{e.status}</span>
                </td>
                <td>
                  {isAdmin && e.status === 'paid' && (
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={async () => {
                        if (!confirm('Cancel this expense? The cash account will be credited back.')) return;
                        try { await api.post(`/finance/expenses/${e.id}/cancel`); toast.success('Cancelled'); refresh(); }
                        catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                      }}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {expenseForm && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setExpenseForm(null); }}>
          <form className="admin-form" style={{ maxWidth: 560 }} onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post('/finance/expenses', expenseForm);
              toast.success('Expense recorded');
              setExpenseForm(null);
              refresh();
            } catch (err) {
              toast.error(err.response?.data?.message || 'Failed');
            }
          }}>
            <h3>New Expense</h3>
            <div className="form-row">
              <div className="form-group"><label>Category *</label>
                <select value={expenseForm.expenseCategoryId} onChange={(ev) => setExpenseForm({ ...expenseForm, expenseCategoryId: ev.target.value })} required>
                  <option value="">— Select —</option>
                  {expenseCategories.filter((c) => c.active !== false).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {expenseCategories.length === 0 && <small style={{ color: 'var(--text-light)' }}>Open Categories panel above to add some</small>}
              </div>
              <div className="form-group"><label>Date *</label>
                <input type="date" value={expenseForm.expenseDate} onChange={(ev) => setExpenseForm({ ...expenseForm, expenseDate: ev.target.value })} required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Amount ({currency}) *</label>
                <input type="number" step="0.001" min="0" value={expenseForm.amount} onChange={(ev) => setExpenseForm({ ...expenseForm, amount: ev.target.value })} required />
              </div>
              <div className="form-group"><label>Payment method</label>
                <select value={expenseForm.paymentMethod} onChange={(ev) => setExpenseForm({ ...expenseForm, paymentMethod: ev.target.value })}>
                  <option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank</option><option value="cheque">Cheque</option><option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Cash account *</label>
                <select value={expenseForm.cashAccountId} onChange={(ev) => setExpenseForm({ ...expenseForm, cashAccountId: ev.target.value })} required>
                  <option value="">— Select —</option>
                  {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({currency}{parseFloat(a.balance || 0).toFixed(3)})</option>)}
                </select>
              </div>
              <div className="form-group"><label>Location (optional)</label>
                <select value={expenseForm.locationId} onChange={(ev) => setExpenseForm({ ...expenseForm, locationId: ev.target.value })}>
                  <option value="">— None —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label>Description *</label>
              <input value={expenseForm.description} onChange={(ev) => setExpenseForm({ ...expenseForm, description: ev.target.value })} required />
            </div>
            <div className="form-row">
              <div className="form-group"><label>Reference (invoice #)</label>
                <input value={expenseForm.reference} onChange={(ev) => setExpenseForm({ ...expenseForm, reference: ev.target.value })} />
              </div>
            </div>
            <div className="form-group"><label>Notes</label>
              <textarea rows={2} value={expenseForm.notes} onChange={(ev) => setExpenseForm({ ...expenseForm, notes: ev.target.value })} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Record</button>
              <button type="button" className="btn btn-secondary" onClick={() => setExpenseForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {expenseCatForm && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setExpenseCatForm(null); }}>
          <form className="admin-form" style={{ maxWidth: 420 }} onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (expenseCatForm._editing) await api.put(`/finance/expense-categories/${expenseCatForm.id}`, { name: expenseCatForm.name, code: expenseCatForm.code, active: expenseCatForm.active });
              else await api.post('/finance/expense-categories', { name: expenseCatForm.name, code: expenseCatForm.code });
              toast.success('Saved');
              setExpenseCatForm(null);
              refreshCats();
            } catch (err) {
              toast.error(err.response?.data?.message || 'Failed');
            }
          }}>
            <h3>{expenseCatForm._editing ? 'Edit Category' : 'New Category'}</h3>
            <div className="form-group"><label>Name *</label>
              <input value={expenseCatForm.name} onChange={(ev) => setExpenseCatForm({ ...expenseCatForm, name: ev.target.value })} required /></div>
            <div className="form-group"><label>Code</label>
              <input value={expenseCatForm.code || ''} onChange={(ev) => setExpenseCatForm({ ...expenseCatForm, code: ev.target.value })} /></div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Save</button>
              <button type="button" className="btn btn-secondary" onClick={() => setExpenseCatForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Cash Transfers ────────────────────────────────────────────────
function CashTransfersTab({ currency, isAdmin, cashAccounts, cashTransfers, setCashTransfers, cashTransferForm, setCashTransferForm }) {
  const refresh = () => api.get('/finance/cash-transfers').then((r) => setCashTransfers(r.data));

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Cash Transfers</h2>
        <button className="btn btn-primary" onClick={() => setCashTransferForm({ fromAccountId: '', toAccountId: '', amount: '', transferDate: new Date().toISOString().slice(0, 10), notes: '' })}>
          <HiPlus /> New Transfer
        </button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Date</th><th>Transfer #</th><th>From</th><th>To</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {cashTransfers.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No transfers</td></tr>}
            {cashTransfers.map((tr) => (
              <tr key={tr.id} style={{ opacity: tr.status === 'cancelled' ? 0.5 : 1 }}>
                <td style={{ fontSize: '0.82rem' }}>{new Date(tr.transferDate).toLocaleDateString()}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{tr.transferNumber}</td>
                <td>{tr.fromAccount?.name || '—'}</td>
                <td>{tr.toAccount?.name || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{parseFloat(tr.amount).toFixed(3)}</td>
                <td>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                    background: tr.status === 'completed' ? 'rgba(90,138,106,0.15)' : 'rgba(220,38,38,0.15)',
                    color: tr.status === 'completed' ? 'var(--success)' : 'var(--danger)' }}>{tr.status}</span>
                </td>
                <td>
                  {isAdmin && tr.status === 'completed' && (
                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={async () => {
                        if (!confirm('Cancel this transfer?')) return;
                        try { await api.post(`/finance/cash-transfers/${tr.id}/cancel`); toast.success('Cancelled'); refresh(); }
                        catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                      }}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cashTransferForm && (
        <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCashTransferForm(null); }}>
          <form className="admin-form" style={{ maxWidth: 480 }} onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post('/finance/cash-transfers', cashTransferForm);
              toast.success('Transfer recorded');
              setCashTransferForm(null);
              refresh();
            } catch (err) {
              toast.error(err.response?.data?.message || 'Failed');
            }
          }}>
            <h3>New Cash Transfer</h3>
            <div className="form-group"><label>From account *</label>
              <select value={cashTransferForm.fromAccountId} onChange={(ev) => setCashTransferForm({ ...cashTransferForm, fromAccountId: ev.target.value })} required>
                <option value="">— Select —</option>
                {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({currency}{parseFloat(a.balance || 0).toFixed(3)})</option>)}
              </select>
            </div>
            <div className="form-group"><label>To account *</label>
              <select value={cashTransferForm.toAccountId} onChange={(ev) => setCashTransferForm({ ...cashTransferForm, toAccountId: ev.target.value })} required>
                <option value="">— Select —</option>
                {cashAccounts.filter((a) => String(a.id) !== String(cashTransferForm.fromAccountId)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Amount ({currency}) *</label>
                <input type="number" step="0.001" min="0" value={cashTransferForm.amount} onChange={(ev) => setCashTransferForm({ ...cashTransferForm, amount: ev.target.value })} required /></div>
              <div className="form-group"><label>Date *</label>
                <input type="date" value={cashTransferForm.transferDate} onChange={(ev) => setCashTransferForm({ ...cashTransferForm, transferDate: ev.target.value })} required /></div>
            </div>
            <div className="form-group"><label>Notes</label>
              <textarea rows={2} value={cashTransferForm.notes} onChange={(ev) => setCashTransferForm({ ...cashTransferForm, notes: ev.target.value })} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">Transfer</button>
              <button type="button" className="btn btn-secondary" onClick={() => setCashTransferForm(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Daily Cash reconciliation ─────────────────────────────────────
function DailyCashTab({ currency, locations, dailyCash, dailyCashFilter, setDailyCashFilter }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Daily Cash Reconciliation</h2>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
        <div><label style={dlbl}>Date</label><input type="date" value={dailyCashFilter.date} onChange={(e) => setDailyCashFilter({ ...dailyCashFilter, date: e.target.value })} /></div>
        <div><label style={dlbl}>Location</label>
          <select value={dailyCashFilter.locationId} onChange={(e) => setDailyCashFilter({ ...dailyCashFilter, locationId: e.target.value })}>
            <option value="">All</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      {!dailyCash && <p style={{ color: 'var(--text-light)' }}>Loading…</p>}
      {dailyCash && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr>
              <th>Account</th>
              <th style={{ textAlign: 'right' }}>Opening</th>
              <th style={{ textAlign: 'right' }}>Sales</th>
              <th style={{ textAlign: 'right' }}>Refunds</th>
              <th style={{ textAlign: 'right' }}>Expenses</th>
              <th style={{ textAlign: 'right' }}>Transfers in</th>
              <th style={{ textAlign: 'right' }}>Transfers out</th>
              <th style={{ textAlign: 'right' }}>Other</th>
              <th style={{ textAlign: 'right' }}>Expected close</th>
            </tr></thead>
            <tbody>
              {dailyCash.accounts.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No accounts in scope</td></tr>}
              {dailyCash.accounts.map((a) => (
                <tr key={a.cashAccount.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{a.cashAccount.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>{ACCT_TYPE_LABEL[a.cashAccount.type] || a.cashAccount.type}{a.cashAccount.location ? ` · ${a.cashAccount.location.name}` : ''}</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{currency}{a.opening.toFixed(3)}</td>
                  <td style={{ textAlign: 'right', color: a.sales > 0 ? 'var(--success)' : 'inherit' }}>{currency}{a.sales.toFixed(3)}</td>
                  <td style={{ textAlign: 'right', color: a.refunds < 0 ? 'var(--danger)' : 'inherit' }}>{currency}{a.refunds.toFixed(3)}</td>
                  <td style={{ textAlign: 'right', color: a.expenses < 0 ? 'var(--danger)' : 'inherit' }}>{currency}{a.expenses.toFixed(3)}</td>
                  <td style={{ textAlign: 'right' }}>{currency}{a.transfersIn.toFixed(3)}</td>
                  <td style={{ textAlign: 'right' }}>{currency}{a.transfersOut.toFixed(3)}</td>
                  <td style={{ textAlign: 'right' }}>{currency}{a.other.toFixed(3)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{a.expected.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Daybook ───────────────────────────────────────────────────────
function DaybookTab({ currency, cashAccounts, daybook, daybookFilter, setDaybookFilter }) {
  const SOURCE_LABEL = {
    sale: 'Sale', return: 'Refund', expense: 'Expense',
    supplier_payment: 'Supplier payment', transfer: 'Transfer',
    opening: 'Opening', adjust: 'Adjustment', other: 'Other',
  };
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Daybook</h2>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
        <div><label style={dlbl}>Date</label><input type="date" value={daybookFilter.date} onChange={(e) => setDaybookFilter({ ...daybookFilter, date: e.target.value })} /></div>
        <div><label style={dlbl}>Account</label>
          <select value={daybookFilter.accountId} onChange={(e) => setDaybookFilter({ ...daybookFilter, accountId: e.target.value })}>
            <option value="">All</option>
            {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div><label style={dlbl}>Source</label>
          <select value={daybookFilter.source} onChange={(e) => setDaybookFilter({ ...daybookFilter, source: e.target.value })}>
            <option value="">All</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {daybook && (
        <>
          <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="dash-card"><div className="dash-card-label">Money in</div><div className="dash-card-value" style={{ color: 'var(--success)' }}>{currency}{daybook.totals.in.toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">Money out</div><div className="dash-card-value" style={{ color: 'var(--danger)' }}>{currency}{Math.abs(daybook.totals.out).toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">Net</div><div className="dash-card-value" style={{ color: daybook.totals.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{currency}{daybook.totals.net.toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">Entries</div><div className="dash-card-value">{daybook.entries.length}</div></div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Time</th><th>Account</th><th>Source</th><th>Reference</th><th>Description</th><th style={{ textAlign: 'right' }}>In</th><th style={{ textAlign: 'right' }}>Out</th><th>By</th></tr></thead>
              <tbody>
                {daybook.entries.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No entries</td></tr>}
                {daybook.entries.map((e) => {
                  const amt = parseFloat(e.amount);
                  return (
                    <tr key={e.id}>
                      <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleTimeString()}</td>
                      <td>{e.CashAccount?.name || '—'}</td>
                      <td>{SOURCE_LABEL[e.source] || e.source}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{e.reference || '—'}</td>
                      <td style={{ fontSize: '0.85rem' }}>{e.description || '—'}</td>
                      <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>{amt > 0 ? `${currency}${amt.toFixed(3)}` : ''}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 600 }}>{amt < 0 ? `${currency}${Math.abs(amt).toFixed(3)}` : ''}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-light)' }}>{e.author?.name || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── P&L ───────────────────────────────────────────────────────────
function PnlTab({ currency, locations, pnl, pnlFilter, setPnlFilter }) {
  const setRange = (kind) => {
    const today = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    if (kind === 'today') setPnlFilter({ ...pnlFilter, from: iso(today), to: iso(today) });
    if (kind === '7d') { const d = new Date(today); d.setDate(d.getDate() - 6); setPnlFilter({ ...pnlFilter, from: iso(d), to: iso(today) }); }
    if (kind === '30d') { const d = new Date(today); d.setDate(d.getDate() - 29); setPnlFilter({ ...pnlFilter, from: iso(d), to: iso(today) }); }
    if (kind === 'mtd') setPnlFilter({ ...pnlFilter, from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) });
    if (kind === 'ytd') setPnlFilter({ ...pnlFilter, from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today) });
  };

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Profit &amp; Loss</h2>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
        <div><label style={dlbl}>From</label><input type="date" value={pnlFilter.from} onChange={(e) => setPnlFilter({ ...pnlFilter, from: e.target.value })} /></div>
        <div><label style={dlbl}>To</label><input type="date" value={pnlFilter.to} onChange={(e) => setPnlFilter({ ...pnlFilter, to: e.target.value })} /></div>
        <div><label style={dlbl}>Location</label>
          <select value={pnlFilter.locationId} onChange={(e) => setPnlFilter({ ...pnlFilter, locationId: e.target.value })}>
            <option value="">All</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['today', '7d', '30d', 'mtd', 'ytd'].map((k) => (
            <button key={k} className="btn btn-secondary" style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }} onClick={() => setRange(k)}>{k.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {pnl && (
        <>
          <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="dash-card"><div className="dash-card-label">Revenue</div><div className="dash-card-value">{currency}{pnl.netRevenue.toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">COGS</div><div className="dash-card-value">{currency}{pnl.cogs.toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">Gross profit</div><div className="dash-card-value" style={{ color: pnl.grossProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{currency}{pnl.grossProfit.toFixed(3)}</div><div className="dash-card-change" style={{ color: 'var(--text-light)' }}>{pnl.grossMargin}% margin</div></div>
            <div className="dash-card"><div className="dash-card-label">Expenses</div><div className="dash-card-value">{currency}{pnl.expenses.toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">Net profit</div><div className="dash-card-value" style={{ color: pnl.netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{currency}{pnl.netProfit.toFixed(3)}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem' }}>
            <div>
              <h3 style={{ marginBottom: '0.5rem' }}>Revenue by category</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Category</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>COGS</th><th style={{ textAlign: 'right' }}>Gross</th></tr></thead>
                  <tbody>
                    {pnl.byCategory.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-light)' }}>No sales</td></tr>}
                    {pnl.byCategory.map((r, i) => (
                      <tr key={i}>
                        <td>{r.category}</td>
                        <td style={{ textAlign: 'right' }}>{r.qty}</td>
                        <td style={{ textAlign: 'right' }}>{currency}{r.revenue.toFixed(3)}</td>
                        <td style={{ textAlign: 'right' }}>{currency}{r.cogs.toFixed(3)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{r.grossProfit.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 style={{ marginBottom: '0.5rem' }}>Expenses by category</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {pnl.expensesByCategory.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-light)' }}>No expenses</td></tr>}
                    {pnl.expensesByCategory.map((r, i) => (
                      <tr key={i}>
                        <td>{r.category}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{r.amount.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {pnl.cogs === 0 && pnl.revenue > 0 && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(196,120,74,0.1)', borderRadius: 8, marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Heads up:</strong> COGS is 0. Set <em>Cost Price</em> on your products (or receive a PO with unit costs) so margin can be calculated.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Stock Value ───────────────────────────────────────────────────
function StockValueTab({ currency, locations, stockValue, stockValueFilter, setStockValueFilter }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Stock Value</h2>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
        <div><label style={dlbl}>Location</label>
          <select value={stockValueFilter.locationId} onChange={(e) => setStockValueFilter({ ...stockValueFilter, locationId: e.target.value })}>
            <option value="">All</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>

      {stockValue && (
        <>
          <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div className="dash-card"><div className="dash-card-label">Total units</div><div className="dash-card-value">{stockValue.totals.quantity.toLocaleString()}</div></div>
            <div className="dash-card"><div className="dash-card-label">Stock value (cost)</div><div className="dash-card-value">{currency}{stockValue.totals.value.toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">Retail value</div><div className="dash-card-value">{currency}{stockValue.totals.retailValue.toFixed(3)}</div></div>
            <div className="dash-card"><div className="dash-card-label">Potential margin</div><div className="dash-card-value">{stockValue.totals.marginPct}%</div></div>
          </div>

          {!stockValueFilter.locationId && stockValue.byLocation.length > 1 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>By location</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Location</th><th style={{ textAlign: 'right' }}>Units</th><th style={{ textAlign: 'right' }}>Cost value</th><th style={{ textAlign: 'right' }}>Retail value</th></tr></thead>
                  <tbody>
                    {stockValue.byLocation.map((r) => (
                      <tr key={r.locationId}>
                        <td>{r.locationName}</td>
                        <td style={{ textAlign: 'right' }}>{r.quantity.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{r.value.toFixed(3)}</td>
                        <td style={{ textAlign: 'right' }}>{currency}{r.retailValue.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <h3 style={{ marginBottom: '0.5rem' }}>By product</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Item</th><th>Location</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Value</th><th style={{ textAlign: 'right' }}>Retail</th><th style={{ textAlign: 'right' }}>Margin</th></tr></thead>
              <tbody>
                {stockValue.rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No stock</td></tr>}
                {stockValue.rows.map((r, i) => (
                  <tr key={i} style={{ opacity: r.quantity === 0 ? 0.4 : 1 }}>
                    <td>
                      <div>{r.name}</div>
                      {r.sku && <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', fontFamily: 'monospace' }}>{r.sku}</div>}
                    </td>
                    <td>{r.location?.name || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{r.costPrice ? `${currency}${r.costPrice.toFixed(3)}` : <span style={{ color: 'var(--text-light)' }}>no cost</span>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{currency}{r.value.toFixed(3)}</td>
                    <td style={{ textAlign: 'right' }}>{currency}{r.retailValue.toFixed(3)}</td>
                    <td style={{ textAlign: 'right', color: r.margin > 0 ? 'var(--success)' : 'var(--text-light)' }}>{r.costPrice ? `${r.margin}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────
const dlbl = { display: 'block', fontSize: 12, marginBottom: 4 };

function filterParams(f) {
  const p = {};
  if (f.from) p.from = new Date(f.from + 'T00:00:00').toISOString();
  if (f.to) p.to = new Date(f.to + 'T23:59:59.999').toISOString();
  if (f.categoryId) p.expenseCategoryId = f.categoryId;
  if (f.locationId) p.locationId = f.locationId;
  return p;
}
