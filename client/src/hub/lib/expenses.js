/**
 * Expenses, Assets & Liabilities — vocabulary and pure helpers (mirrors
 * server/src/routes/hubFinance.js). Data access lives in `@/hub/lib/api`.
 * These records are financial only; product stock purchases stay in Stock In.
 */
export const PAYMENT_METHODS = ['Cash', 'Fawran', 'Card', 'Bank Transfer', 'Other'];

/** Company-owned payment sources. One of these is required when the company paid. */
export const COMPANY_FUNDING_SOURCES = [
  'Company Bank', 'Petty Cash', 'Cash in Hand', 'Cash Drawer', 'Fawran', 'Company Money', 'Other Company Account',
];

export const PERSONAL_FUNDING_SOURCE = 'Paid Personally';

export const FUNDING_SOURCES = [...COMPANY_FUNDING_SOURCES, PERSONAL_FUNDING_SOURCE];

/** True when the money left a company account (i.e. not a personal payment). */
export function isCompanyFunded(source) {
  return source !== PERSONAL_FUNDING_SOURCE;
}

/** The account a reimbursement leaves from by default, per payment method (server uses the same map). */
export const METHOD_DEFAULT_SOURCE = {
  Cash: 'Cash in Hand', Fawran: 'Fawran', Card: 'Company Bank', 'Bank Transfer': 'Company Bank', Other: 'Other Company Account',
};

export const EXPENSE_CATEGORIES = [
  'Rent', 'Salaries', 'Utilities', 'Packing Material', 'Delivery / Courier', 'Marketing', 'Transport', 'Office Supplies',
  'Maintenance', 'Government / Fees', 'Bank Charges', 'Other',
];

export const ASSET_CATEGORIES = [
  'Furniture', 'Fixtures & Racks', 'Equipment', 'Computer / IT', 'Printer', 'Vehicle', 'Shop Improvement', 'Software', 'Other',
];

export const NOT_RECORDED = 'Not Recorded';

export const LIABILITY_STATUS_LABELS = {
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid / Settled',
};

function reference(kind) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${kind === 'expense' ? 'EXP' : 'AST'}-${date}-${rand}`;
}

export function newEntryReference(kind) {
  return reference(kind);
}

export function newIdempotencyKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------- helpers -------------------------------- */

export function filterEntries(rows, filters) {
  const term = (filters.search ?? '').trim().toLowerCase();
  return rows.filter((row) => {
    if (
      term &&
      !`${row.reference} ${row.item} ${row.category} ${row.payee ?? ''} ${row.purchasePerson ?? ''}`
        .toLowerCase()
        .includes(term)
    ) {
      return false;
    }
    if (filters.category && row.category !== filters.category) return false;
    if (filters.fundingSource && row.fundingSource !== filters.fundingSource) return false;
    if (filters.from && row.date < filters.from) return false;
    if (filters.to && row.date > filters.to) return false;
    return true;
  });
}

export function filterLiabilities(rows, filters) {
  const term = (filters.search ?? '').trim().toLowerCase();
  return rows.filter((row) => {
    if (term && !`${row.person} ${row.entry?.reference ?? ''} ${row.entry?.item ?? ''}`.toLowerCase().includes(term)) {
      return false;
    }
    if (filters.status && row.status !== filters.status) return false;
    const date = row.entry?.date ?? String(row.createdAt).slice(0, 10);
    if (filters.from && date < filters.from) return false;
    if (filters.to && date > filters.to) return false;
    return true;
  });
}

export function money(value) {
  return `QAR ${Number(value || 0).toFixed(2)}`;
}

/** Display value for the purchased-by field; older records were never captured. */
export function purchasedByLabel(value) {
  return value && value.trim() ? value.trim() : NOT_RECORDED;
}

/** People already seen in expense/asset records, for the pick-or-type field. */
export function knownPeople(rows) {
  const set = new Set();
  for (const row of rows) {
    for (const value of [row.purchasedBy, row.purchasePerson]) {
      const name = (value ?? '').trim();
      if (name && name !== NOT_RECORDED) set.add(name);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ------------------------- monthly paid-out summary ------------------------ */

function inMonth(date, year, month) {
  if (!date) return false;
  const y = Number(String(date).slice(0, 4));
  const m = Number(String(date).slice(5, 7));
  return y === year && m === month;
}

function emptySection() {
  return { direct: 0, reimbursed: 0, total: 0, bySource: [], rows: [] };
}

function finishSection(section, sources) {
  section.total = Number((section.direct + section.reimbursed).toFixed(2));
  section.direct = Number(section.direct.toFixed(2));
  section.reimbursed = Number(section.reimbursed.toFixed(2));
  section.bySource = [...sources.entries()]
    .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value);
  section.rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  return section;
}

/**
 * Money that actually left company funds in the selected month: company-funded
 * expenses/assets plus reimbursements already paid for personal purchases.
 * Pending / unpaid liabilities are excluded, and assets never count as expenses.
 */
export function monthlySummary(expenses, assets, liabilities, year, month) {
  const expenseSection = emptySection();
  const assetSection = emptySection();
  const expenseSources = new Map();
  const assetSources = new Map();

  const add = (map, label, value) => map.set(label, (map.get(label) ?? 0) + value);

  for (const row of [...expenses, ...assets]) {
    if (!isCompanyFunded(row.fundingSource)) continue;
    if (!inMonth(row.date, year, month)) continue;
    const isAsset = row.entryType === 'asset';
    const section = isAsset ? assetSection : expenseSection;
    const sources = isAsset ? assetSources : expenseSources;
    section.direct += row.amount;
    add(sources, row.fundingSource, row.amount);
    section.rows.push({
      id: row.id,
      entryType: row.entryType,
      date: row.date,
      reference: row.reference,
      category: row.category,
      item: row.item,
      source: row.fundingSource,
      amount: row.amount,
      kind: 'direct',
      purchasedBy: row.purchasedBy,
      liabilityPerson: null,
      reimbursed: 0,
      outstanding: 0,
      status: 'Paid by company',
      notes: row.notes,
    });
  }

  let pendingExcluded = 0;
  const unpaidExpenses = [];
  const unpaidAssets = [];
  for (const liability of liabilities) {
    pendingExcluded += liability.outstanding;
    const entryDate = liability.entry?.date ?? String(liability.createdAt).slice(0, 10);
    if (liability.outstanding > 0 && inMonth(entryDate, year, month)) {
      const row = {
        id: liability.id,
        entryType: liability.entry?.entryType ?? 'expense',
        date: entryDate,
        reference: liability.entry?.reference ?? '—',
        category: liability.entry?.category ?? 'Personal purchase',
        item: liability.entry?.item ?? 'Personal purchase',
        person: liability.person,
        purchasedBy: liability.entry?.purchasedBy ?? liability.person,
        notes: liability.entry?.notes ?? liability.notes,
        amount: liability.amount,
        reimbursed: liability.reimbursed,
        outstanding: liability.outstanding,
        status: liability.status,
      };
      (row.entryType === 'asset' ? unpaidAssets : unpaidExpenses).push(row);
    }
    const isAsset = liability.entry?.entryType === 'asset';
    const section = isAsset ? assetSection : expenseSection;
    const sources = isAsset ? assetSources : expenseSources;
    for (const r of liability.reimbursements) {
      if (!inMonth(r.paidOn, year, month)) continue;
      section.reimbursed += r.amount;
      add(sources, `Reimbursement · ${r.paymentMethod}`, r.amount);
      section.rows.push({
        id: r.id,
        entryType: isAsset ? 'asset' : 'expense',
        date: r.paidOn,
        reference: liability.entry?.reference ?? '—',
        category: liability.entry?.category ?? 'Reimbursement',
        item: `${liability.entry?.item ?? 'Personal purchase'} — reimbursed to ${liability.person}`,
        source: r.paymentMethod,
        amount: r.amount,
        kind: 'reimbursement',
        purchasedBy: liability.entry?.purchasedBy ?? liability.person,
        liabilityPerson: liability.person,
        reimbursed: r.amount,
        outstanding: liability.outstanding,
        status: LIABILITY_STATUS_LABELS[liability.status],
        notes: r.notes,
      });
    }
  }

  finishSection(expenseSection, expenseSources);
  finishSection(assetSection, assetSources);

  const sortRows = (rows) => rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  const sum = (rows) => Number(rows.reduce((t, r) => t + r.outstanding, 0).toFixed(2));
  sortRows(unpaidExpenses);
  sortRows(unpaidAssets);
  const expensesTotal = sum(unpaidExpenses);
  const assetsTotal = sum(unpaidAssets);

  return {
    year,
    month,
    expenses: expenseSection,
    assets: assetSection,
    total: Number((expenseSection.total + assetSection.total).toFixed(2)),
    pendingExcluded: Number(pendingExcluded.toFixed(2)),
    unpaid: {
      expenses: unpaidExpenses,
      assets: unpaidAssets,
      expensesTotal,
      assetsTotal,
      total: Number((expensesTotal + assetsTotal).toFixed(2)),
    },
  };
}

/* ------------------------- monthly Excel export -------------------------- */

const MONTHLY_EXPORT_COLUMNS = [
  'Date', 'Type', 'Description', 'Category', 'Amount (QAR)', 'Purchased/Expense Made By', 'Paid From',
  'Liability Person', 'Amount Reimbursed (QAR)', 'Outstanding Balance (QAR)', 'Status', 'Notes',
];

const typeLabel = (kind) => (kind === 'asset' ? 'Asset Purchase' : 'Daily Expense');

/**
 * Read-only export of the selected month and Paid/Unpaid view. Numbers come
 * straight from the summary, so cash, liability and reimbursement maths are
 * untouched.
 */
export function monthlyExportSheet(summary, view) {
  const rows = [[...MONTHLY_EXPORT_COLUMNS]];

  if (view === 'paid') {
    const paid = [...summary.expenses.rows, ...summary.assets.rows].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const row of paid) {
      rows.push([
        row.date, typeLabel(row.entryType), row.item, row.category, Number(row.amount.toFixed(2)),
        purchasedByLabel(row.purchasedBy), row.source, row.liabilityPerson ?? '', Number(row.reimbursed.toFixed(2)),
        Number(row.outstanding.toFixed(2)), row.status, row.notes ?? '',
      ]);
    }
  } else {
    const unpaid = [...summary.unpaid.expenses, ...summary.unpaid.assets].sort((a, b) => (a.date < b.date ? 1 : -1));
    for (const row of unpaid) {
      rows.push([
        row.date, typeLabel(row.entryType), row.item, row.category, Number(row.amount.toFixed(2)),
        purchasedByLabel(row.purchasedBy), PERSONAL_FUNDING_SOURCE, row.person, Number(row.reimbursed.toFixed(2)),
        Number(row.outstanding.toFixed(2)), LIABILITY_STATUS_LABELS[row.status], row.notes ?? '',
      ]);
    }
  }

  rows.push([]);
  rows.push(['Totals']);
  rows.push(['Paid daily expenses', Number(summary.expenses.total.toFixed(2))]);
  rows.push(['Paid asset purchases', Number(summary.assets.total.toFixed(2))]);
  rows.push(['Unpaid daily expenses', Number(summary.unpaid.expensesTotal.toFixed(2))]);
  rows.push(['Unpaid asset purchases', Number(summary.unpaid.assetsTotal.toFixed(2))]);

  return { rows, sheetName: view === 'paid' ? 'Paid Expenses' : 'Unpaid Personally Paid' };
}
