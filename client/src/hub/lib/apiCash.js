import { useQueryClient } from '@tanstack/react-query';

import { get, qk, send } from './api';

/**
 * Cash & Bank, owner capital and fixed-asset detail: the classic
 * /api/finance and /api/accounting endpoints, used natively by the hub.
 */
export const cashKeys = {
  all: ['femnia', 'cash'],
  accounts: ['femnia', 'cash', 'accounts'],
  statement: (id, from, to) => ['femnia', 'cash', 'statement', id, from, to],
  transfers: (from, to) => ['femnia', 'cash', 'transfers', from, to],
  daily: (date, locationId) => ['femnia', 'cash', 'daily', date, locationId],
  daybook: (filters) => ['femnia', 'cash', 'daybook', filters],
  capital: (filters) => ['femnia', 'cash', 'capital', filters],
  asset: (id) => ['femnia', 'cash', 'asset', id],
  locations: ['femnia', 'locations'],
};

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
};

/** Every account, inactive included, each with its live `balance`. */
export const cashAccountsQuery = {
  queryKey: cashKeys.accounts,
  queryFn: () => get('/finance/cash-accounts'),
  staleTime: 15_000,
};
export const accountStatementQuery = (id, from, to) => ({
  queryKey: cashKeys.statement(id, from, to),
  queryFn: () => get(`/finance/cash-accounts/${id}/transactions${qs({ from, to, limit: 500 })}`),
  enabled: Boolean(id),
});
export const cashTransfersQuery = (from, to) => ({
  queryKey: cashKeys.transfers(from, to),
  queryFn: () => get(`/finance/cash-transfers${qs({ from, to })}`),
});
export const dailyCashQuery = (date, locationId) => ({
  queryKey: cashKeys.daily(date, locationId),
  queryFn: () => get(`/finance/daily-cash${qs({ date, locationId })}`),
});
export const daybookQuery = (filters) => ({
  queryKey: cashKeys.daybook(filters),
  queryFn: () => get(`/finance/daybook${qs(filters)}`),
});
export const capitalQuery = (filters) => ({
  queryKey: cashKeys.capital(filters),
  queryFn: () => get(`/accounting/capital${qs(filters)}`),
});
export const assetDetailQuery = (id) => ({
  queryKey: cashKeys.asset(id),
  queryFn: () => get(`/accounting/assets/${id}`),
  enabled: Boolean(id),
});
export const locationsQuery = { queryKey: cashKeys.locations, queryFn: () => get('/locations'), staleTime: 60_000 };

export const createCashAccount = (input) => send('post', '/finance/cash-accounts', input);
export const updateCashAccount = (id, input) => send('put', `/finance/cash-accounts/${id}`, input);
/** Deactivates instead when the account has history (`softDeleted: true`). */
export const deleteCashAccount = (id) => send('delete', `/finance/cash-accounts/${id}`);
export const createCashTransfer = (input) => send('post', '/finance/cash-transfers', input);
export const cancelCashTransfer = (id) => send('post', `/finance/cash-transfers/${id}/cancel`);
export const createCapitalEntry = (input) => send('post', '/accounting/capital', input);
export const cancelCapitalEntry = (id) => send('post', `/accounting/capital/${id}/cancel`);
export const updateAsset = (id, input) => send('put', `/accounting/assets/${id}`, input);
export const disposeAsset = (id, input) => send('post', `/accounting/assets/${id}/dispose`, input);
export const runDepreciation = () => send('post', '/accounting/depreciation/run', {});

/** Everything a money movement can change: balances, statements, the asset lists. */
export const cashInvalidationKeys = [cashKeys.all, qk.assets, qk.expenses, qk.fundingAccounts, qk.activity];

export const ACCOUNT_TYPES = {
  drawer: 'Cash drawer',
  petty_cash: 'Petty cash',
  bank: 'Bank',
  card_terminal: 'Card terminal',
  other: 'Other',
};

export const SOURCE_LABELS = {
  sale: 'Sale',
  return: 'Refund',
  expense: 'Expense',
  supplier_payment: 'Supplier payment',
  transfer: 'Transfer',
  opening: 'Opening',
  adjust: 'Adjustment',
  other: 'Other',
  capital: 'Owner capital',
  asset: 'Fixed asset',
};

/** DECIMAL columns arrive as strings. */
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function useInvalidateCash() {
  const client = useQueryClient();
  return () => Promise.all(cashInvalidationKeys.map((queryKey) => client.invalidateQueries({ queryKey })));
}

export const ASSET_CATEGORY_OPTIONS = {
  furniture: 'Furniture',
  fixtures: 'Fixtures',
  equipment: 'Equipment',
  computer: 'Computer',
  vehicle: 'Vehicle',
  leasehold: 'Leasehold improvements',
  other: 'Other',
};
