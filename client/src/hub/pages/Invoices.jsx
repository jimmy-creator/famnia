/**
 * Invoices & Labels.
 *
 * Read-only over existing confirmed sales orders. Printing reuses the
 * InvoiceSheet layout and the isolated /hub/print/delivery-label page —
 * nothing here writes stock, payments or order status. Label prints only bump
 * the print counter and write an activity entry.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, Printer, Search, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { InvoiceSheet } from '@/hub/components/OrderPrint';
import { SalesOrderDetails } from '@/hub/components/SalesOrderDetails';
import { EmptyState, ErrorState, LoadingRows, PageHeader, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { accessQuery, appSettingsQuery, ordersQuery, qk, recordInvoicePrint, recordLabelPrint } from '@/hub/lib/api';
import { QAR } from '@/hub/lib/format';
import { can } from '@/hub/lib/permissions';
import {
  LABEL_SIZES,
  deliveryLabelUrl,
  hasStoredLabelSize,
  printDocument,
  readLabelSize,
  storeLabelSize,
} from '@/hub/lib/printing';
import { SALES_PAYMENT_STATUSES } from '@/hub/lib/sales';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const day = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function InvoicesPage() {
  useHubTitle('Invoices & Labels — FEMNIA Hub');
  const orders = useQuery(ordersQuery);
  const access = useQuery(accessQuery).data ?? null;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get('order') ?? '';

  const [tab, setTab] = useState('invoices');
  const [search, setSearch] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('All');
  const [fulfilment, setFulfilment] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // A size the user picked on this device wins; otherwise the Settings default.
  const [chosenSize, setChosenSize] = useState(() => (hasStoredLabelSize() ? readLabelSize() : null));
  const [printing, setPrinting] = useState(null);
  const [preview, setPreview] = useState(null);

  const settingsData = useQuery(appSettingsQuery).data;
  const labelSize = chosenSize ?? settingsData?.labelSize ?? '100x130';
  /** Print header/footer text comes from Settings, with the built-in defaults as fallback. */
  const printBusiness = {
    name: settingsData?.businessName ?? 'FEMNIA',
    location: settingsData?.location ?? 'Al Thumama, Qatar',
    phone: settingsData?.phone ?? '66543343',
    currency: settingsData?.currency ?? 'QAR',
    invoiceFooter: settingsData?.invoiceFooter ?? 'Thank you for shopping with FEMNIA.',
    labelFooter: settingsData?.labelFooter ?? '',
    logoUrl: settingsData?.logoUrl ?? '',
  };

  const canViewInvoices = can(access, 'invoices.view');
  const canPrintInvoice = can(access, 'invoices.print');
  const canDownloadInvoice = can(access, 'invoices.download');
  const canLabels = can(access, 'invoices.labels') || can(access, 'invoices.labels_print');
  const canPrintLabel = can(access, 'invoices.labels_print');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return (orders.data ?? [])
      .filter((o) => o.status !== 'Draft')
      .filter((o) => (tab === 'labels' ? o.fulfilmentMethod === 'Delivery' : true))
      .filter((o) => {
        if (paymentStatus !== 'All' && o.paymentStatus !== paymentStatus) return false;
        if (fulfilment !== 'All' && o.fulfilmentMethod !== fulfilment) return false;
        const date = String(o.orderDate).slice(0, 10);
        if (from && date < from) return false;
        if (to && date > to) return false;
        if (!q) return true;
        if (digits && o.phone.replace(/\D/g, '').includes(digits)) return true;
        return [o.id, o.customerName, o.area].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      });
  }, [orders.data, tab, search, paymentStatus, fulfilment, from, to]);

  const openOrder = (id) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('order', id);
        else next.delete('order');
        return next;
      },
      { replace: true },
    );

  /** Mounts the invoice sheet, then opens the browser print / save-as-PDF dialog. */
  const printInvoice = (order) => {
    setPrinting(order);
    window.setTimeout(() => printDocument('invoice', labelSize), 120);
    void recordInvoicePrint(order.id).catch(() => undefined);
  };

  /** Opens the isolated one-page label page; only the print counter and activity log change. */
  const openLabel = async (order, autoprint) => {
    storeLabelSize(labelSize);
    window.open(deliveryLabelUrl(order.id, labelSize, autoprint), '_blank', 'noopener,noreferrer');
    try {
      await recordLabelPrint(order.id, labelSize);
      await queryClient.invalidateQueries({ queryKey: qk.order(order.id) });
    } catch {
      toast.info('Label opened. Print bookkeeping could not be recorded.');
    }
  };

  if (!canViewInvoices) {
    return (
      <>
        <PageHeader title="Invoices & Labels" subtitle="Restricted area" />
        <EmptyState title="You do not have permission to view invoices" hint="Ask an Admin for invoice access." />
      </>
    );
  }

  if (orders.isPending) return <LoadingRows count={8} />;
  if (orders.isError) {
    return (
      <ErrorState
        section="invoices"
        message={orders.error instanceof Error ? orders.error.message : 'Unknown error'}
        onRetry={() => void orders.refetch()}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Invoices & Labels"
        subtitle="A4 invoices and 100 × 130 / 100 × 150 mm thermal labels. Printing never changes stock, payments or status."
        onRefresh={() => void orders.refetch()}
        refreshing={orders.isFetching}
      />

      <div className="no-print mb-4 flex gap-2">
        <Button
          variant={tab === 'invoices' ? 'default' : 'outline'}
          className="h-10 flex-1 sm:flex-none"
          onClick={() => setTab('invoices')}
        >
          <FileText className="mr-2 size-4" /> Invoices
        </Button>
        <Button
          variant={tab === 'labels' ? 'default' : 'outline'}
          className="h-10 flex-1 sm:flex-none"
          onClick={() => setTab('labels')}
        >
          <Tag className="mr-2 size-4" /> Delivery Labels
        </Button>
      </div>

      <div className="no-print card-surface mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, customer name or mobile"
            className="h-11 pl-9"
            aria-label="Search invoices"
          />
        </div>
        <Select value={paymentStatus} onValueChange={setPaymentStatus}>
          <SelectTrigger className="h-11" aria-label="Filter by payment status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All payment statuses</SelectItem>
            {SALES_PAYMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fulfilment} onValueChange={setFulfilment} disabled={tab === 'labels'}>
          <SelectTrigger className="h-11" aria-label="Filter by fulfilment type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All fulfilment types</SelectItem>
            <SelectItem value="Delivery">Delivery</SelectItem>
            <SelectItem value="Customer Pickup">Customer Pickup</SelectItem>
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11" aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" aria-label="To date" />
        </div>
        {tab === 'labels' && (
          <Select value={labelSize} onValueChange={setChosenSize}>
            <SelectTrigger className="h-11" aria-label="Label size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace('x', ' × ')} mm
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!rows.length && (
        <EmptyState
          title="No confirmed orders match these filters"
          hint={tab === 'labels' ? 'Delivery labels apply to Delivery orders only.' : 'Adjust the search or date range.'}
        />
      )}

      <div className="no-print space-y-3">
        {rows.map((o) => (
          <div key={o.id} className="card-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{o.id}</p>
                <p className="text-sm">{o.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {o.phone} · {day(o.orderDate)} · {o.fulfilmentMethod}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={o.status} />
                <StatusBadge value={o.paymentStatus} />
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <Cell label="Items" value={QAR(o.itemsBeforeDiscount)} />
              <Cell label="Discount" value={QAR(o.totalDiscount)} />
              <Cell label="Delivery" value={QAR(o.deliveryCharge)} />
              <Cell label="Grand total" value={QAR(o.grandTotal)} strong />
              <Cell label="Paid" value={QAR(o.amountReceived)} />
              <Cell label="Balance" value={QAR(o.remainingBalance)} />
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" className="h-10" onClick={() => openOrder(o.id)}>
                View order
              </Button>

              {tab === 'invoices' ? (
                <>
                  <Button variant="outline" className="h-10" onClick={() => setPreview(o)}>
                    <Eye className="mr-2 size-4" /> Preview A4 invoice
                  </Button>
                  {canPrintInvoice && (
                    <Button variant="outline" className="h-10" onClick={() => printInvoice(o)}>
                      <Printer className="mr-2 size-4" /> Print invoice
                    </Button>
                  )}
                  {canDownloadInvoice && (
                    <Button variant="outline" className="h-10" onClick={() => printInvoice(o)}>
                      <Download className="mr-2 size-4" /> Save as PDF
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button variant="outline" className="h-10" onClick={() => void openLabel(o, false)}>
                    <Eye className="mr-2 size-4" /> Preview label
                  </Button>
                  {canPrintLabel && (
                    <>
                      <Button variant="outline" className="h-10" onClick={() => void openLabel(o, true)}>
                        <Tag className="mr-2 size-4" /> Print {labelSize.replace('x', ' × ')} mm
                      </Button>
                      <Button variant="outline" className="h-10" onClick={() => void openLabel(o, true)}>
                        <Download className="mr-2 size-4" /> Save as PDF
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {tab === 'labels' && !canLabels && (
        <p className="mt-3 text-xs text-muted-foreground">You do not have permission to print delivery labels.</p>
      )}

      {/* on-screen preview of the unchanged invoice layout */}
      <Dialog open={Boolean(preview)} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="z-[70] max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice preview — {preview?.id}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="invoice-preview overflow-x-auto rounded-xl border border-border">
              <InvoiceSheet order={preview} business={printBusiness} />
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" className="h-11" onClick={() => setPreview(null)}>
              Close
            </Button>
            {canPrintInvoice && preview && (
              <Button
                className="h-11"
                onClick={() => {
                  const order = preview;
                  setPreview(null);
                  window.setTimeout(() => printInvoice(order), 150);
                }}
              >
                <Printer className="mr-2 size-4" /> Print / Save as PDF
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* print surface: mounted only while printing, hidden on screen */}
      {printing && <InvoiceSheet order={printing} business={printBusiness} />}

      <SalesOrderDetails orderId={selected || null} onClose={() => openOrder(null)} />
    </div>
  );
}

function Cell({ label, value, strong }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-semibold' : ''}>{value}</dd>
    </div>
  );
}
