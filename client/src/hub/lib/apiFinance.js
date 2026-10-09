import { get, qk, send } from '@/hub/lib/api';

/**
 * Expenses & Assets, merged with Back Office: lists include classic expenses
 * and every fixed asset, voided rows too (the page strikes them through and
 * leaves them out of totals). Keys sit under qk.expenses / qk.assets so the
 * existing invalidations refresh them.
 */
export const expensesAllQuery = {
  queryKey: [...qk.expenses, 'all'],
  queryFn: () => get('/hub/expenses?type=expense&includeVoided=1'),
};
export const assetsAllQuery = {
  queryKey: [...qk.assets, 'all'],
  queryFn: () => get('/hub/expenses?type=asset&includeVoided=1'),
};

export const expenseCategoriesQuery = {
  queryKey: ['femnia', 'expense-categories'],
  queryFn: () => get('/hub/finance/expense-categories'),
  staleTime: 60_000,
};
export const addExpenseCategory = (name) => send('post', '/hub/finance/expense-categories', { name });
export const updateExpenseCategory = (id, patch) => send('put', `/hub/finance/expense-categories/${id}`, patch);

/** id: hub entry id, `c-<expenseId>` or `a-<assetId>`. */
export const voidEntry = (id, reason) => send('post', `/hub/expenses/${encodeURIComponent(id)}/void`, { reason });
