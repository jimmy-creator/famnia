import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Lock } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  BalanceSheetReport,
  DeadStockReport,
  FastMovingReport,
  PnlReport,
  PurchasesReport,
  SalesAnalysisReport,
  StockValueReport,
} from '@/hub/components/ReportsAnalysis';
import { EmptyState, ErrorState, Kpi, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import {
  accessQuery,
  assetsQuery,
  expensesQuery,
  financialSummaryQuery,
  liabilitiesQuery,
  ordersQuery,
  productsQuery,
  saleCostsQuery,
  stockInQuery,
  stockOutQuery,
} from '@/hub/lib/api';
import { MULTILOC, canAnalytics } from '@/hub/lib/apiReportsExtra';
import { computeConsignment } from '@/hub/lib/consignment';
import { LIABILITY_STATUS_LABELS, money } from '@/hub/lib/expenses';
import { downloadFile, toCsv } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import { PRODUCT_SALES_SORTS, buildProductSalesReport, currentMonthRange } from '@/hub/lib/productSales';
import {
  RANGE_PRESETS,
  buildExpenseReport,
  buildInventoryReport,
  buildLiabilityReport,
  buildPaymentsReport,
  buildSalesReport,
  dayOf,
  monthStartIso,
  rangeFor,
  todayIso,
} from '@/hub/lib/reports';
import { downloadWorkbook } from '@/hub/lib/spreadsheet';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { cn } from '@/lib/utils';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Consignment snapshot for one order, summed over its consignment lines and
 * adjusted for returned pieces. Delivery charges are never included.
 * Returns null for a normal (non-consignment) sale.
 */
function orderConsignment(order) {
  const lines = order.items.filter((i) => i.isConsignment);
  if (!lines.length) return null;
  const totals = {
    partners: [...new Set(lines.map((l) => (l.consignmentPartner ?? '').trim()).filter(Boolean))].join(' | '),
    opPercent: lines[0]?.consignmentOpPercent ?? 0,
    productCost: 0,
    opCost: 0,
    otherCost: 0,
    remainingProfit: 0,
    profitShare: 0,
    femniaTotal: 0,
    partnerTotal: 0,
  };
  for (const l of lines) {
    const sold = Number(l.quantity ?? 0);
    if (sold <= 0) continue;
    const netQty = Math.max(sold - Math.min(Number(l.returnedQty ?? 0), sold), 0);
    const netTotal = (Number(l.lineTotal ?? 0) / sold) * netQty;
    const split = computeConsignment(
      {
        partner: l.consignmentPartner ?? '',
        productCost: Number(l.consignmentProductCost ?? 0),
        opPercent: Number(l.consignmentOpPercent ?? 0),
        opMin: Number(l.consignmentOpMin ?? 0),
        otherCost: Number(l.consignmentOtherCost ?? 0),
      },
      netQty,
      netTotal,
    );
    totals.productCost += split.productCost;
    totals.opCost += split.opCost;
    totals.otherCost += split.otherCost;
    totals.remainingProfit += split.remainingProfit;
    totals.profitShare += split.profitShare;
    totals.femniaTotal += split.femniaTotal;
    totals.partnerTotal += split.partnerTotal;
  }
  return {
    ...totals,
    productCost: round2(totals.productCost),
    opCost: round2(totals.opCost),
    otherCost: round2(totals.otherCost),
    remainingProfit: round2(totals.remainingProfit),
    profitShare: round2(totals.profitShare),
    femniaTotal: round2(totals.femniaTotal),
    partnerTotal: round2(totals.partnerTotal),
  };
}

/** Tabs served by components/ReportsAnalysis — own filters, own CSV export. */
const ERP_TABS = new Set(['sales-analysis', 'fast-moving', 'dead-stock', 'purchases', 'pnl', 'balance-sheet', 'stock-value']);

const CHART_COLORS = ['#4A2040', '#8C5A82', '#B98AAE', '#D8B4CE', '#EDE4F2', '#A97C50'];

const ESTIMATE_NOTE =
  'Operational estimate only — not an audited financial statement. Delivery charges are excluded from product revenue and assets are excluded from daily expenses.';

function Section({ title, note, children }) {
  return (
    <section className="card-surface mt-4 p-4">
      <h2 className="section-title text-sm font-semibold text-foreground">{title}</h2>
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Table({ head, rows }) {
  if (!rows.length) return <EmptyState title="No records in this date range" />;
  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3">
            {head.map((h, j) => (
              <div key={h} className="flex justify-between gap-3 py-0.5 text-sm">
                <span className="text-muted-foreground">{h}</span>
                <span className="text-right font-medium text-foreground">{r[j]}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2 text-foreground">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function BarsChart({ data, label }) {
  if (!data.length) return <EmptyState title="Nothing to chart yet" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} width={56} />
          <Tooltip formatter={(v) => money(v)} />
          <Bar dataKey="value" name={label} fill="#4A2040" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SliceChart({ data }) {
  if (!data.length) return <EmptyState title="Nothing to chart yet" />;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={45} outerRadius={85} paddingAngle={2}>
            {data.map((d, i) => (
              <Cell key={d.label} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => money(v)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function Denied({ what }) {
  return (
    <div className="card-surface flex flex-col items-center gap-3 p-8 text-center">
      <Lock className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{what} is restricted</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Ask an Admin to grant the matching Reports permission. The database also blocks these figures for
        unauthorised staff.
      </p>
    </div>
  );
}

function profitLines(f) {
  const lines = [
    ['Product sales (delivery charges excluded)', f.productSales],
    ['Product cost of goods sold', f.cogs],
    ['Gross profit', f.grossProfit],
    ['Daily expenses (assets excluded)', f.expenses],
  ];
  lines.push(['Estimated net profit', f.netProfit]);
  lines.push(['Delivery charges collected (not product revenue)', f.deliveryCharges]);
  return lines;
}

export default function ReportsPage() {
  useHubTitle('Reports — FEMNIA Hub');
  const queryClient = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const orders = useQuery(ordersQuery);
  const products = useQuery(productsQuery);
  const stockIn = useQuery(stockInQuery);
  const stockOut = useQuery(stockOutQuery);

  const canOperational = can(access, 'reports.operational');
  const canFinancial = can(access, 'reports.financial');
  const canExport = can(access, 'reports.export');
  const canExpenses = canFinancial || can(access, 'expenses.view');
  const canAssets = canFinancial || can(access, 'assets.view');
  const canLiabilities = canFinancial || can(access, 'liabilities.view');
  const canCost = can(access, 'products.view_cost');
  const canErp = canAnalytics(access);

  // Only fetch what the API will actually serve this account.
  const expenses = useQuery({ ...expensesQuery, enabled: Boolean(access) && canExpenses });
  const assets = useQuery({ ...assetsQuery, enabled: Boolean(access) && canAssets });
  const liabilities = useQuery({ ...liabilitiesQuery, enabled: Boolean(access) && canLiabilities });
  const saleCosts = useQuery({ ...saleCostsQuery, enabled: Boolean(access) && canFinancial });

  const [preset, setPreset] = useState('This month');
  const [range, setRange] = useState(() => ({ from: monthStartIso(), to: todayIso() }));
  // The tab lives in ?tab= so each report is linkable (old /admin/erp links land here).
  const [searchParams, setSearchParams] = useSearchParams();
  const setTab = (key) => setSearchParams({ tab: key }, { replace: true });

  const tabGroups = [
    {
      label: 'Hub',
      tabs: [
        { key: 'sales', label: 'Sales', visible: canOperational },
        { key: 'product-sales', label: 'Product Sales', visible: canOperational },
        { key: 'inventory', label: 'Inventory', visible: canOperational },
        { key: 'profit', label: 'Profit', visible: canFinancial },
        { key: 'expenses', label: 'Expenses & Assets', visible: canFinancial || can(access, 'expenses.view') },
        { key: 'liabilities', label: 'Liabilities', visible: can(access, 'liabilities.view') },
        { key: 'payments', label: 'Payments', visible: canOperational && can(access, 'payments.view') },
      ],
    },
    {
      label: 'Sales & stock analysis',
      tabs: [
        { key: 'sales-analysis', label: 'Sales analysis', visible: canErp },
        { key: 'fast-moving', label: 'Fast moving', visible: canErp },
        { key: 'dead-stock', label: 'Dead stock', visible: canErp },
        { key: 'purchases', label: 'Purchases', visible: canErp && MULTILOC },
      ],
    },
    {
      label: 'Accounts',
      tabs: [
        { key: 'pnl', label: 'Profit & Loss (cash)', visible: canErp && MULTILOC },
        { key: 'balance-sheet', label: 'Balance sheet', visible: canErp && MULTILOC },
        { key: 'stock-value', label: 'Stock value', visible: canErp && MULTILOC },
      ],
    },
  ]
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => t.visible) }))
    .filter((g) => g.tabs.length);
  const visibleKeys = tabGroups.flatMap((g) => g.tabs.map((t) => t.key));
  const wanted = searchParams.get('tab') || 'sales';
  const tab = visibleKeys.includes(wanted) ? wanted : visibleKeys[0];
  const isErpTab = ERP_TABS.has(tab);
  // Reports with their own date controls (or none) hide the shared range bar.
  const usesRange = !['fast-moving', 'dead-stock', 'balance-sheet', 'stock-value'].includes(tab);
  const [psSearch, setPsSearch] = useState('');
  const [psCategory, setPsCategory] = useState('All');
  const [psSort, setPsSort] = useState('quantity');
  const [psOpen, setPsOpen] = useState({});

  const financial = useQuery(financialSummaryQuery(range.from, range.to, canFinancial && tab === 'profit'));

  const sales = useMemo(() => buildSalesReport(orders.data ?? [], range), [orders.data, range]);
  const inventory = useMemo(
    () => buildInventoryReport(products.data ?? [], stockIn.data ?? [], stockOut.data ?? [], range, sales.itemUnits),
    [products.data, stockIn.data, stockOut.data, range, sales.itemUnits],
  );
  const spend = useMemo(
    () => buildExpenseReport(expenses.data ?? [], assets.data ?? [], range),
    [expenses.data, assets.data, range],
  );
  const liability = useMemo(() => buildLiabilityReport(liabilities.data ?? [], range), [liabilities.data, range]);
  const payments = useMemo(() => buildPaymentsReport(orders.data ?? [], range), [orders.data, range]);
  const productSales = useMemo(
    () =>
      buildProductSalesReport(orders.data ?? [], products.data ?? [], saleCosts.data ?? {}, range, {
        search: psSearch,
        category: psCategory,
        sort: psSort,
      }),
    [orders.data, products.data, saleCosts.data, range, psSearch, psCategory, psSort],
  );

  const applyPreset = (p) => {
    setPreset(p);
    setRange((cur) => rangeFor(p, cur));
  };

  /* --------------------------------- exports --------------------------------- */
  /** Primary table for the active tab — shared by the Excel and CSV exports. */
  const exportTable = () => {
    if (tab === 'sales')
      return {
        title: 'FEMNIA Sales Report',
        head: [
          'Order',
          'Date',
          'Customer',
          'Fulfilment',
          'Status',
          'Items',
          'Discount',
          'Delivery',
          'Grand Total',
          'Received',
          'Balance',
          'Payment',
          'Consignment Sale',
          'Partner',
          'Product Cost',
          'OP Cost %',
          'Applied OP Cost',
          'Other Cost',
          'Remaining Profit',
          'FEMNIA Profit Share',
          'FEMNIA Total Receives',
          'Partner Receives',
        ],
        body: sales.orders.map((o) => {
          const c = orderConsignment(o);
          return [
            o.id,
            dayOf(o.orderDate),
            o.customerName,
            o.fulfilmentMethod,
            o.status,
            o.items.reduce((s, i) => s + i.quantity, 0),
            o.totalDiscount,
            o.deliveryCharge,
            o.grandTotal,
            o.amountReceived,
            o.remainingBalance,
            o.paymentStatus,
            c ? 'Yes' : 'No',
            c?.partners ?? '',
            c?.productCost ?? '',
            c?.opPercent ?? '',
            c?.opCost ?? '',
            c?.otherCost ?? '',
            c?.remainingProfit ?? '',
            c?.profitShare ?? '',
            c?.femniaTotal ?? '',
            c?.partnerTotal ?? '',
          ];
        }),
      };

    if (tab === 'product-sales')
      return {
        title: 'FEMNIA Product Sales Report',
        head: canFinancial
          ? ['Product Name', 'Category', 'SKUs', 'Total Quantity Sold', 'Current Stock', 'Current Month Qty', 'Total Sales Value', 'Total COGS', 'Total Profit']
          : ['Product Name', 'Category', 'SKUs', 'Total Quantity Sold', 'Current Stock', 'Current Month Qty', 'Total Sales Value'],
        body: productSales.rows.flatMap((r) => {
          const base = [r.name, r.category, r.skus.join(' | '), r.quantitySold, r.currentStock, r.monthQuantity, r.salesValue];
          const row = canFinancial ? [...base, r.cogs, r.profit] : base;
          const variants = r.variants.map((v) => {
            const vb = [
              `   ${v.sku}`,
              [v.size, v.color].filter(Boolean).join(' / '),
              v.sku,
              v.quantitySold,
              v.currentStock,
              v.monthQuantity,
              v.salesValue,
            ];
            return canFinancial ? [...vb, v.cogs, v.profit] : vb;
          });
          return [row, ...variants];
        }),
      };
    if (tab === 'inventory')
      return {
        title: 'FEMNIA Inventory Report',
        head: ['SKU', 'Product', 'Category', 'Size', 'Colour', 'Current Stock', 'Cost Value', 'Retail Value', 'Status'],
        body: (products.data ?? []).map((p) => [
          p.sku,
          p.name,
          p.category ?? '',
          p.size ?? '',
          p.color ?? '',
          p.currentStock,
          canCost ? p.currentStock * p.costPrice : '',
          p.currentStock * p.sellingPriceQar,
          p.stockStatus,
        ]),
      };
    if (tab === 'profit')
      return {
        title: 'FEMNIA Profit Estimate (operational estimate only)',
        head: ['Line', 'Amount'],
        body: financial.data
          ? profitLines(financial.data).map(([label, value]) => [label, value ?? 0])
          : [['Estimated net profit', 0]],
      };
    if (tab === 'expenses')
      return {
        title: 'FEMNIA Expenses & Assets',
        head: ['Type', 'Reference', 'Date', 'Category', 'Item', 'Amount', 'Payment Method', 'Funding Source', 'Paid By'],
        body: [...spend.expenses, ...spend.assets].map((e) => [
          e.entryType === 'asset' ? 'Asset' : 'Expense',
          e.reference,
          e.date,
          e.category,
          e.item,
          e.amount,
          e.paymentMethod,
          e.fundingSource,
          e.purchasePerson ?? '',
        ]),
      };
    if (tab === 'liabilities')
      return {
        title: 'FEMNIA Liabilities',
        head: ['Person', 'Reference', 'Date', 'Item', 'Amount', 'Reimbursed', 'Outstanding', 'Status'],
        body: liability.rows.map((l) => [
          l.person,
          l.entry?.reference ?? '',
          l.entry?.date ?? '',
          l.entry?.item ?? '',
          l.amount,
          l.reimbursed,
          l.outstanding,
          LIABILITY_STATUS_LABELS[l.status],
        ]),
      };
    return {
      title: 'FEMNIA Payments Report',
      head: ['Payment method', 'Orders', 'Received', 'Balance'],
      body: payments.byMethod.map((m) => [m.label, m.orders, m.received, m.balance]),
      extra: [[], ['Money held in', 'Amount'], ...payments.byHeldIn.map((h) => [h.label, h.value])],
    };
  };

  const exportExcel = () => {
    const t = exportTable();
    downloadWorkbook(`FEMNIA_${tab}_report_${range.from}_${range.to}.xlsx`, [
      {
        name: tab,
        rows: [[t.title, `${range.from} to ${range.to}`], [ESTIMATE_NOTE], [], t.head, ...t.body, ...(t.extra ?? [])],
      },
    ]);
  };

  const exportCsv = () => {
    const t = exportTable();
    const objects = t.body.map((r) => Object.fromEntries(t.head.map((k, i) => [k, r[i] ?? ''])));
    downloadFile(`FEMNIA_${tab}_report_${range.from}_${range.to}.csv`, toCsv(objects));
  };

  const loading =
    orders.isLoading || products.isLoading || stockIn.isLoading || expenses.isLoading || liabilities.isLoading;
  const error = orders.error ?? products.error ?? stockIn.error ?? null;

  if (!access) return <LoadingRows count={4} />;
  if (!visibleKeys.length) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Reports" />
        <Denied what="Reports" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Reports"
        subtitle={isErpTab ? 'Figures from the store ledger — the same numbers as the till and accounts.' : ESTIMATE_NOTE}
        onRefresh={() => {
          if (isErpTab) {
            void queryClient.invalidateQueries({ queryKey: ['femnia', 'reports-extra'] });
            return;
          }
          orders.refetch();
          products.refetch();
          stockIn.refetch();
          stockOut.refetch();
          if (canExpenses) expenses.refetch();
          if (canAssets) assets.refetch();
          if (canFinancial) saleCosts.refetch();
          if (canLiabilities) liabilities.refetch();
          if (canFinancial) financial.refetch();
        }}
        refreshing={orders.isFetching || products.isFetching}
        actions={
          canExport && !isErpTab ? (
            <>
              <Button size="sm" variant="outline" className="h-10" onClick={exportExcel}>
                <FileSpreadsheet className="mr-2 size-4" /> Export Excel
              </Button>
              <Button size="sm" variant="outline" className="h-10" onClick={exportCsv}>
                <Download className="mr-2 size-4" /> Export CSV
              </Button>
            </>
          ) : null
        }
      />

      {/* Tabs, grouped so the many reports stay findable */}
      <div className="no-print mb-4 space-y-2">
        {tabGroups.map((g) => (
          <div key={g.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            {tabGroups.length > 1 && (
              <span className="w-44 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </span>
            )}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {g.tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                    tab === t.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-secondary',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Date filters */}
      <div
        className={cn(
          'no-print card-surface mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-end sm:justify-between',
          !usesRange && 'hidden',
        )}
      >
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm font-medium',
                preset === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-72">
          <Input
            type="date"
            aria-label="From date"
            className="h-10"
            value={range.from}
            onChange={(e) => {
              setPreset('Custom');
              setRange((r) => ({ ...r, from: e.target.value }));
            }}
          />
          <Input
            type="date"
            aria-label="To date"
            className="h-10"
            value={range.to}
            onChange={(e) => {
              setPreset('Custom');
              setRange((r) => ({ ...r, to: e.target.value }));
            }}
          />
        </div>
      </div>

      {tab === 'sales-analysis' ? (
        <SalesAnalysisReport range={range} />
      ) : tab === 'fast-moving' ? (
        <FastMovingReport />
      ) : tab === 'dead-stock' ? (
        <DeadStockReport />
      ) : tab === 'purchases' ? (
        <PurchasesReport range={range} />
      ) : tab === 'pnl' ? (
        <PnlReport range={range} />
      ) : tab === 'balance-sheet' ? (
        <BalanceSheetReport />
      ) : tab === 'stock-value' ? (
        <StockValueReport />
      ) : error ? (
        <ErrorState
          section="reports"
          message={error.message}
          onRetry={() => {
            void orders.refetch();
            void products.refetch();
          }}
        />
      ) : loading ? (
        <LoadingRows count={6} />
      ) : (
        <>
          {tab === 'sales' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Kpi label="Orders" value={sales.orderCount} />
                <Kpi label="Units sold" value={sales.itemUnits} />
                <Kpi label="Item sales" value={money(sales.itemSales)} />
                <Kpi label="Discounts" value={money(sales.discounts)} tone="warn" />
                <Kpi label="Delivery charges" value={money(sales.deliveryCharges)} />
                <Kpi label="Grand total" value={money(sales.grandTotal)} />
                <Kpi label="Payments received" value={money(sales.received)} tone="good" />
                <Kpi label="Outstanding balance" value={money(sales.balance)} tone="danger" />
              </div>
              <Section title="Sales by day">
                <BarsChart data={sales.byDay} label="Sales" />
              </Section>
              <Section title="Top products">
                <Table
                  head={['SKU', 'Product', 'Units', 'Sales']}
                  rows={sales.topProducts.map((p) => [p.sku, p.name, p.units, money(p.value)])}
                />
              </Section>
              <Section title="Orders" note="Confirmed / non-cancelled orders only.">
                <Table
                  head={['Order', 'Date', 'Customer', 'Status', 'Grand total', 'Received', 'Balance']}
                  rows={sales.orders.map((o) => [
                    o.id,
                    dayOf(o.orderDate),
                    o.customerName,
                    o.status,
                    money(o.grandTotal),
                    money(o.amountReceived),
                    money(o.remainingBalance),
                  ])}
                />
              </Section>
            </>
          )}

          {tab === 'product-sales' && (
            <>
              <div className="no-print card-surface mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  className="h-10"
                  placeholder="Search product name or SKU"
                  aria-label="Search product name or SKU"
                  value={psSearch}
                  onChange={(e) => setPsSearch(e.target.value)}
                />
                <select
                  aria-label="Category"
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={psCategory}
                  onChange={(e) => setPsCategory(e.target.value)}
                >
                  <option value="All">All categories</option>
                  {productSales.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort by"
                  className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                  value={psSort}
                  onChange={(e) => setPsSort(e.target.value)}
                >
                  {PRODUCT_SALES_SORTS.map((o) => (
                    <option key={o.key} value={o.key}>
                      Sort by {o.label.toLowerCase()}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => {
                    setPreset('This month');
                    setRange(currentMonthRange());
                  }}
                >
                  Current month
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi label="Products" value={productSales.rows.length} />
                <Kpi label="Net units sold" value={productSales.totals.quantitySold} />
                <Kpi label="This month units" value={productSales.totals.monthQuantity} />
                <Kpi label="Sales value" value={money(productSales.totals.salesValue)} tone="good" />
                {canFinancial && <Kpi label="COGS" value={money(productSales.totals.cogs)} tone="warn" />}
                {canFinancial && (
                  <Kpi
                    label="Profit"
                    value={money(productSales.totals.profit)}
                    tone={productSales.totals.profit >= 0 ? 'good' : 'danger'}
                  />
                )}
                <Kpi label="Units in stock" value={productSales.totals.currentStock} />
              </div>

              <Section
                title="Product sales"
                note="Confirmed orders only; cancelled orders excluded and returned quantities and values deducted. Tap a product to see each SKU, size and colour."
              >
                {productSales.rows.length === 0 ? (
                  <EmptyState title="No product sales in this selection" />
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="space-y-2 md:hidden">
                      {productSales.rows.map((r) => (
                        <div key={r.name} className="rounded-xl border border-border bg-card p-3">
                          <button
                            className="flex w-full items-start justify-between gap-2 text-left"
                            onClick={() => setPsOpen((o) => ({ ...o, [r.name]: !o[r.name] }))}
                          >
                            <span className="min-w-0">
                              <span className="block break-words text-sm font-semibold text-foreground">{r.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {r.category} · {r.skus.length} SKU{r.skus.length === 1 ? '' : 's'}
                              </span>
                            </span>
                            {psOpen[r.name] ? (
                              <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                          <div className="mt-2 space-y-0.5">
                            <Line label="Total quantity sold" value={r.quantitySold} />
                            <Line label="Current stock" value={r.currentStock} />
                            <Line label="Current month qty" value={r.monthQuantity} />
                            <Line label="Total sales value" value={money(r.salesValue)} />
                            {canFinancial && <Line label="Total cost (COGS)" value={money(r.cogs)} />}
                            {canFinancial && <Line label="Total profit" value={money(r.profit)} />}
                          </div>
                          {psOpen[r.name] && (
                            <div className="mt-2 space-y-2 border-t border-border pt-2">
                              {r.variants.map((v) => (
                                <div key={v.sku} className="rounded-lg bg-secondary/40 p-2">
                                  <p className="break-all text-xs font-semibold text-foreground">{v.sku}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {[v.size, v.color].filter(Boolean).join(' / ') || 'No size / colour'}
                                  </p>
                                  <Line label="Sold" value={v.quantitySold} />
                                  <Line label="Stock" value={v.currentStock} />
                                  <Line label="This month" value={v.monthQuantity} />
                                  <Line label="Sales" value={money(v.salesValue)} />
                                  {canFinancial && <Line label="Profit" value={money(v.profit)} />}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Product Name</th>
                            <th className="px-3 py-2 font-medium">Total Qty Sold</th>
                            <th className="px-3 py-2 font-medium">Current Stock</th>
                            <th className="px-3 py-2 font-medium">Current Month Qty</th>
                            <th className="px-3 py-2 font-medium">Total Sales Value</th>
                            {canFinancial && <th className="px-3 py-2 font-medium">Total COGS</th>}
                            {canFinancial && <th className="px-3 py-2 font-medium">Total Profit</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {productSales.rows.map((r) => (
                            <Fragment key={r.name}>
                              <tr className="border-b border-border/60">
                                <td className="px-3 py-2">
                                  <button
                                    className="flex items-center gap-2 text-left font-medium text-foreground"
                                    onClick={() => setPsOpen((o) => ({ ...o, [r.name]: !o[r.name] }))}
                                  >
                                    {psOpen[r.name] ? (
                                      <ChevronDown className="size-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="size-4 text-muted-foreground" />
                                    )}
                                    <span>
                                      {r.name}
                                      <span className="block text-xs font-normal text-muted-foreground">
                                        {r.category} · {r.skus.length} SKU{r.skus.length === 1 ? '' : 's'}
                                      </span>
                                    </span>
                                  </button>
                                </td>
                                <td className="px-3 py-2">{r.quantitySold}</td>
                                <td className="px-3 py-2">{r.currentStock}</td>
                                <td className="px-3 py-2">{r.monthQuantity}</td>
                                <td className="px-3 py-2">{money(r.salesValue)}</td>
                                {canFinancial && <td className="px-3 py-2">{money(r.cogs)}</td>}
                                {canFinancial && <td className="px-3 py-2">{money(r.profit)}</td>}
                              </tr>
                              {psOpen[r.name] &&
                                r.variants.map((v) => (
                                  <tr key={`${r.name}-${v.sku}`} className="border-b border-border/40 bg-secondary/30">
                                    <td className="px-3 py-2 pl-10 text-xs text-muted-foreground">
                                      {v.sku}
                                      {[v.size, v.color].filter(Boolean).length
                                        ? ` · ${[v.size, v.color].filter(Boolean).join(' / ')}`
                                        : ''}
                                    </td>
                                    <td className="px-3 py-2 text-xs">{v.quantitySold}</td>
                                    <td className="px-3 py-2 text-xs">{v.currentStock}</td>
                                    <td className="px-3 py-2 text-xs">{v.monthQuantity}</td>
                                    <td className="px-3 py-2 text-xs">{money(v.salesValue)}</td>
                                    {canFinancial && <td className="px-3 py-2 text-xs">{money(v.cogs)}</td>}
                                    {canFinancial && <td className="px-3 py-2 text-xs">{money(v.profit)}</td>}
                                  </tr>
                                ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Section>
            </>
          )}

          {tab === 'inventory' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <Kpi label="SKUs" value={inventory.skuCount} />
                <Kpi label="Active SKUs" value={inventory.activeCount} />
                <Kpi label="Units in stock" value={inventory.units} />
                {canCost && <Kpi label="Cost value" value={money(inventory.costValue)} />}
                <Kpi label="Retail value" value={money(inventory.retailValue)} />
                <Kpi label="Low stock" value={inventory.lowStock.length} tone="warn" />
                <Kpi label="Out of stock" value={inventory.outOfStock.length} tone="danger" />
                <Kpi label="Units received (range)" value={inventory.stockInUnits} />
              </div>
              <Section title="Movements in this range">
                <Table
                  head={['Movement', 'Units', 'Value']}
                  rows={[
                    ['Stock In', inventory.stockInUnits, money(inventory.stockInCost)],
                    ['Manual Stock Out', inventory.stockOutUnits, '—'],
                    ['Sold (auto stock out)', inventory.soldUnits, money(sales.itemSales)],
                  ]}
                />
              </Section>
              <Section title="Stock value by category">
                <SliceChart data={inventory.byCategory.map((c) => ({ label: c.label, value: c.retailValue }))} />
              </Section>
              <Section title="Low and out-of-stock products">
                <Table
                  head={['SKU', 'Product', 'Size', 'Colour', 'Current stock', 'Reorder level', 'Status']}
                  rows={[...inventory.outOfStock, ...inventory.lowStock].map((p) => [
                    p.sku,
                    p.name,
                    p.size ?? '—',
                    p.color ?? '—',
                    p.currentStock,
                    p.reorderLevel,
                    p.stockStatus,
                  ])}
                />
              </Section>
            </>
          )}

          {tab === 'profit' &&
            (!canFinancial ? (
              <Denied what="Profit reporting" />
            ) : financial.error ? (
              <ErrorState
                section="profit report"
                message={financial.error.message}
                onRetry={() => {
                  void financial.refetch();
                }}
              />
            ) : financial.isLoading || !financial.data ? (
              <LoadingRows count={4} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <Kpi label="Product sales" value={money(financial.data.productSales)} />
                  <Kpi label="Product cost (COGS)" value={money(financial.data.cogs)} tone="warn" />
                  <Kpi label="Gross profit" value={money(financial.data.grossProfit)} tone="good" />
                  <Kpi label="Expenses" value={money(financial.data.expenses)} tone="warn" />
                  <Kpi
                    label="Estimated net profit"
                    value={money(financial.data.netProfit)}
                    tone={financial.data.netProfit >= 0 ? 'good' : 'danger'}
                  />
                </div>
                <Section title="Profit breakdown" note={ESTIMATE_NOTE}>
                  <Table
                    head={['Line', 'Amount']}
                    rows={profitLines(financial.data).map(([label, value]) => [label, money(value)])}
                  />
                </Section>
                <Section title="Gross profit vs expenses">
                  <BarsChart
                    data={[
                      { label: 'Sales', value: financial.data.productSales },
                      { label: 'COGS', value: financial.data.cogs },
                      { label: 'Gross profit', value: financial.data.grossProfit },
                      { label: 'Expenses', value: financial.data.expenses },
                      { label: 'Net', value: financial.data.netProfit },
                    ]}
                    label="Amount"
                  />
                </Section>
              </>
            ))}

          {tab === 'expenses' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label="Daily expenses" value={money(spend.expenseTotal)} />
                <Kpi label="Expense entries" value={spend.expenseCount} />
                <Kpi label="Assets purchased" value={money(spend.assetTotal)} />
                <Kpi label="Asset entries" value={spend.assetCount} />
              </div>
              <Section title="Expenses by category" note="Assets are reported separately, never as daily expenses.">
                <SliceChart data={spend.byExpenseCategory.map((c) => ({ label: c.label, value: c.value }))} />
                <div className="mt-3">
                  <Table
                    head={['Category', 'Entries', 'Amount']}
                    rows={spend.byExpenseCategory.map((c) => [c.label, c.count, money(c.value)])}
                  />
                </div>
              </Section>
              <Section title="Assets purchased">
                <Table
                  head={['Category', 'Entries', 'Amount']}
                  rows={spend.byAssetCategory.map((c) => [c.label, c.count, money(c.value)])}
                />
              </Section>
              <Section title="Funding source">
                <Table head={['Source', 'Amount']} rows={spend.byFunding.map((f) => [f.label, money(f.value)])} />
              </Section>
            </>
          )}

          {tab === 'liabilities' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi label="Pending" value={liability.pending} tone="warn" />
                <Kpi label="Partially paid" value={liability.partiallyPaid} tone="warn" />
                <Kpi label="Settled" value={liability.settled} tone="good" />
                <Kpi label="Total raised" value={money(liability.totalRaised)} />
                <Kpi label="Reimbursed" value={money(liability.totalReimbursed)} tone="good" />
                <Kpi label="Outstanding" value={money(liability.outstanding)} tone="danger" />
              </div>
              <Section title="Outstanding by person">
                <Table
                  head={['Person', 'Raised', 'Reimbursed', 'Outstanding']}
                  rows={liability.byPerson.map((p) => [p.label, money(p.raised), money(p.reimbursed), money(p.outstanding)])}
                />
              </Section>
              <Section title="Liability records">
                <Table
                  head={['Person', 'Reference', 'Date', 'Item', 'Amount', 'Reimbursed', 'Outstanding', 'Status']}
                  rows={liability.rows.map((l) => [
                    l.person,
                    l.entry?.reference ?? '—',
                    l.entry?.date ?? '—',
                    l.entry?.item ?? '—',
                    money(l.amount),
                    money(l.reimbursed),
                    money(l.outstanding),
                    LIABILITY_STATUS_LABELS[l.status],
                  ])}
                />
              </Section>
            </>
          )}

          {tab === 'payments' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi label="Received" value={money(payments.totalReceived)} tone="good" />
                <Kpi label="Balance" value={money(payments.totalBalance)} tone="danger" />
                <Kpi label="COD outstanding" value={money(payments.codOutstanding)} tone="warn" />
                <Kpi label="Fully paid" value={payments.fullyPaid} />
                <Kpi label="Partially paid" value={payments.partiallyPaid} tone="warn" />
                <Kpi label="Unpaid" value={payments.unpaid} tone="danger" />
              </div>
              <Section title="Payment method totals">
                <SliceChart data={payments.byMethod.map((m) => ({ label: m.label, value: m.received }))} />
                <div className="mt-3">
                  <Table
                    head={['Method', 'Orders', 'Received', 'Balance']}
                    rows={payments.byMethod.map((m) => [m.label, m.orders, money(m.received), money(m.balance)])}
                  />
                </div>
              </Section>
              <Section title="Where money is held">
                <Table head={['Held in', 'Amount']} rows={payments.byHeldIn.map((h) => [h.label, money(h.value)])} />
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
