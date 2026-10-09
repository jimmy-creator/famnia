/**
 * Sales order details: fulfilment, payment, returns, cancellation, printing
 * and the change history. Nothing here creates a sale or a stock movement
 * except an explicit return restock or an explicit cancellation restock.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Loader2, Pencil, Printer, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { InvoiceSheet } from '@/hub/components/OrderPrint';
import { LoadingRows, StatusBadge } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Checkbox } from '@/hub/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/hub/ui/sheet';
import { Textarea } from '@/hub/ui/textarea';
import {
  accessQuery,
  appSettingsQuery,
  confirmSalesOrder,
  correctOrderPricing,
  orderAuditQuery,
  processOrderReturn,
  recordInvoicePrint,
  recordLabelPrint,
  salesOrderQuery,
  updateFulfilmentAndPayment,
  updateOrderContact,
} from '@/hub/lib/api';
import { cancelOrderWithEmail } from '@/hub/lib/apiOrders';
import { WebOrderPanel } from '@/hub/components/WebOrderPanel';
import { computeConsignment } from '@/hub/lib/consignment';
import { invalidateSales } from '@/hub/lib/invalidate';
import { can } from '@/hub/lib/permissions';
import {
  LABEL_SIZES,
  deliveryLabelUrl,
  hasStoredLabelSize,
  printDocument,
  readLabelSize,
  storeLabelSize,
} from '@/hub/lib/printing';
import {
  DELIVERY_FLOW,
  PAYMENT_HELD_IN_OPTIONS,
  PICKUP_FLOW,
  RETURN_REASONS,
  SALES_PAYMENT_METHODS,
  SALES_PAYMENT_STATUSES,
} from '@/hub/lib/sales';

const money = (v) => `QAR ${Number(v || 0).toFixed(2)}`;
const CONTACT_OPEN_STATUSES = ['Draft', 'Confirmed', 'Ready for Delivery', 'Out for Delivery'];

export function SalesOrderDetails({ orderId, onClose }) {
  const open = Boolean(orderId);
  const order = useQuery({ ...salesOrderQuery(orderId ?? ''), enabled: open });
  const data = order.data ?? null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{data ? `Order ${data.id}` : 'Order'}</SheetTitle>
        </SheetHeader>

        {order.isPending && <LoadingRows count={5} />}
        {order.isError && (
          <p className="text-sm text-destructive">
            {order.error instanceof Error ? order.error.message : 'Could not load this order.'}
          </p>
        )}

        {/* Remounted whenever the order reloads, so every form starts from the saved values. */}
        {data && <OrderBody key={`${data.id}:${order.dataUpdatedAt}`} data={data} />}
      </SheetContent>
    </Sheet>
  );
}

function OrderBody({ data }) {
  const audit = useQuery(orderAuditQuery(data.id));
  const access = useQuery(accessQuery);
  const queryClient = useQueryClient();

  const pickup = data.fulfilmentMethod === 'Customer Pickup';
  const flow = pickup ? PICKUP_FLOW : DELIVERY_FLOW;
  const readOnly = Boolean(data.tillSale);

  const [status, setStatus] = useState(data.status);
  const [deliveryDate, setDeliveryDate] = useState(data.deliveryDate ? String(data.deliveryDate).slice(0, 10) : '');
  const [courier, setCourier] = useState(data.courier ?? '');
  const [trackingNumber, setTrackingNumber] = useState(data.trackingNumber ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState(data.deliveryNotes ?? '');
  const [pickupDate, setPickupDate] = useState(data.pickupDate ? String(data.pickupDate).slice(0, 10) : '');
  const [pickupTime, setPickupTime] = useState(data.pickupTime ?? '');
  const [pickupNotes, setPickupNotes] = useState(data.pickupNotes ?? '');
  const [paymentMode, setPaymentMode] = useState(data.paymentMode);
  const [paymentStatus, setPaymentStatus] = useState(data.paymentStatus);
  const [amountReceived, setAmountReceived] = useState(String(data.amountReceived ?? 0));
  const [paymentReference, setPaymentReference] = useState(data.paymentReference ?? '');
  const [paymentHeldIn, setPaymentHeldIn] = useState(data.paymentHeldIn ?? 'Cash in Hand');
  const [paymentHolderDetails, setPaymentHolderDetails] = useState(data.paymentHolderDetails ?? '');
  const [paymentNotes, setPaymentNotes] = useState(data.paymentNotes ?? '');
  const [area, setArea] = useState(data.area ?? '');
  const [address, setAddress] = useState(data.address ?? '');

  const settingsData = useQuery(appSettingsQuery).data;
  // An explicit choice on this device wins; otherwise the Settings default applies.
  const [chosenLabelSize, setChosenLabelSize] = useState(() => (hasStoredLabelSize() ? readLabelSize() : null));
  const labelSize = chosenLabelSize ?? (LABEL_SIZES.includes(settingsData?.labelSize) ? settingsData.labelSize : '100x130');
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

  const [returnOpen, setReturnOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnLines, setReturnLines] = useState(() =>
    Object.fromEntries(
      data.items.map((i) => [String(i.lineIndex), { quantity: '0', reason: RETURN_REASONS[0], restock: true }]),
    ),
  );
  const [cancelReason, setCancelReason] = useState('');
  const [cancelRestock, setCancelRestock] = useState(true);
  /** Draft-only: reveals the fulfilment & payment fields before confirming. */
  const [editDraft, setEditDraft] = useState(false);
  /** Online orders: the classic "your order is now …" email on a status change. */
  const isWeb = data.channel === 'Online';
  const [emailCustomer, setEmailCustomer] = useState(true);

  const canUpdate = can(access.data, 'orders.update_delivery');
  const canPayments = can(access.data, 'payments.edit');
  const canReturns = can(access.data, 'orders.returns');
  const canCancel = can(access.data, 'orders.cancellations');
  const canPrintInvoice = can(access.data, 'invoices.print');
  const canPrintLabel = can(access.data, 'invoices.labels_print');
  const canAudit = can(access.data, 'payments.audit') || can(access.data, 'admin.view_audit');
  const canConfirm = can(access.data, 'orders.confirm');
  const isDraft = data.status === 'Draft';

  const refresh = () => invalidateSales(queryClient, data.id);

  const save = useMutation({
    mutationFn: () =>
      updateFulfilmentAndPayment({
        orderId: data.id,
        // Only a real change: the server refuses Returned/Cancelled here even unchanged.
        ...(status !== data.status ? { status } : {}),
        ...(pickup
          ? { pickupDate: pickupDate || null, pickupTime, pickupNotes }
          : { deliveryDate: deliveryDate || null, courier, trackingNumber, deliveryNotes }),
        ...(canPayments
          ? {
              paymentMode,
              paymentStatus,
              amountReceived: Number(amountReceived) || 0,
              paymentReference,
              paymentHeldIn,
              paymentHolderDetails,
              paymentNotes,
            }
          : {}),
        ...(isWeb ? { emailCustomer } : {}),
      }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(result.changes ? `Saved ${result.changes} change(s). Stock was not affected.` : 'Nothing changed.', {
        description: result.emailed ? 'The customer was emailed about the new status.' : undefined,
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update the order.'),
  });

  const returns = useMutation({
    mutationFn: () =>
      processOrderReturn(
        data.id,
        Object.entries(returnLines).map(([lineIndex, l]) => ({
          lineIndex: Number(lineIndex),
          quantity: Number(l.quantity) || 0,
          reason: l.reason,
          restock: l.restock,
        })),
      ),
    onSuccess: async (result) => {
      setReturnOpen(false);
      toast.success(
        result.restocked
          ? `Return recorded. ${result.restocked} line(s) restocked into inventory.`
          : 'Return recorded. No stock was restocked.',
      );
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not process the return.'),
  });

  const cancel = useMutation({
    mutationFn: () => cancelOrderWithEmail(data.id, cancelReason, cancelRestock, isWeb ? emailCustomer : undefined),
    onSuccess: async (result) => {
      setCancelOpen(false);
      toast.success(result.restored ? 'Order cancelled and stock restored.' : 'Order cancelled.');
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not cancel the order.'),
  });

  /* ---------------- customer & delivery details correction ---------------- */
  const contactLocked = !CONTACT_OPEN_STATUSES.includes(data.status);
  const isCancelled = data.status === 'Cancelled';
  const isAdmin = Boolean(access.data?.isAdmin);
  const canEditContact = !readOnly && canUpdate && !isCancelled && (!contactLocked || isAdmin);
  const canEditCustomerProfile = can(access.data, 'customers.edit');

  const [contactOpen, setContactOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cArea, setCArea] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cLandmark, setCLandmark] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cDate, setCDate] = useState('');
  const [cTime, setCTime] = useState('');
  const [cAlsoCustomer, setCAlsoCustomer] = useState(false);
  const [cReason, setCReason] = useState('');

  const openContactEdit = () => {
    setCName(data.customerName ?? '');
    setCPhone(data.phone ?? '');
    setCArea(data.area ?? '');
    setCAddress(data.address ?? '');
    setCLandmark(data.landmark ?? '');
    setCNotes(pickup ? (data.pickupNotes ?? '') : (data.deliveryNotes ?? ''));
    setCDate(String((pickup ? data.pickupDate : data.deliveryDate) ?? '').slice(0, 10));
    setCTime(data.pickupTime ?? '');
    setCAlsoCustomer(false);
    setCReason('');
    setContactOpen(true);
  };

  const saveContact = useMutation({
    mutationFn: () =>
      updateOrderContact({
        orderId: data.id,
        customerName: cName,
        phone: cPhone,
        area: cArea,
        address: cAddress,
        landmark: cLandmark,
        deliveryNotes: pickup ? undefined : cNotes,
        deliveryDate: pickup ? undefined : cDate,
        pickupDate: pickup ? cDate : undefined,
        pickupTime: pickup ? cTime : undefined,
        alsoUpdateCustomer: cAlsoCustomer,
        reason: contactLocked ? cReason : null,
      }),
    onSuccess: async (result) => {
      setContactOpen(false);
      toast.success(
        result.changes === 0
          ? 'No changes to save.'
          : result.customerUpdated
            ? 'Details updated on this order and on the customer profile.'
            : 'Customer and delivery details updated.',
      );
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save these details.'),
  });

  /* ---------------- audited price & discount correction ---------------- */
  const canCorrectPrices = can(access.data, 'orders.edit_prices') && isAdmin;
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceLines, setPriceLines] = useState([]);
  const [pDiscountType, setPDiscountType] = useState('amount');
  const [pDiscountValue, setPDiscountValue] = useState('0');
  const [pDelivery, setPDelivery] = useState('0');
  const [pReason, setPReason] = useState('');

  const openPriceEdit = () => {
    setPriceLines(
      data.items.map((item) => ({
        id: item.id ?? '',
        name: item.name,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        discount: String(item.discount),
      })),
    );
    setPDiscountType('amount');
    setPDiscountValue('0');
    setPDelivery(String(data.deliveryCharge));
    setPReason('');
    setPriceOpen(true);
  };

  const priceTotals = useMemo(() => {
    const net = priceLines.reduce(
      (sum, l) => sum + Math.max(l.quantity * (Number(l.unitPrice) || 0) - (Number(l.discount) || 0), 0),
      0,
    );
    const value = Math.max(Number(pDiscountValue) || 0, 0);
    const orderDiscount = pDiscountType === 'percent' ? (net * Math.min(value, 100)) / 100 : Math.min(value, net);
    const subtotal = Math.max(net - orderDiscount, 0);
    const delivery = pickup ? 0 : Math.max(Number(pDelivery) || 0, 0);
    return { net, orderDiscount, subtotal, delivery, grandTotal: subtotal + delivery };
  }, [priceLines, pDiscountType, pDiscountValue, pDelivery, pickup]);

  const savePrices = useMutation({
    mutationFn: () =>
      correctOrderPricing({
        orderId: data.id,
        expectedGrandTotal: data.grandTotal,
        items: priceLines.map((l) => ({ id: l.id, unitPrice: Number(l.unitPrice) || 0, discount: Number(l.discount) || 0 })),
        orderDiscountType: pDiscountType,
        orderDiscountValue: Number(pDiscountValue) || 0,
        deliveryCharge: Number(pDelivery) || 0,
        reason: pReason,
      }),
    onSuccess: async (result) => {
      setPriceOpen(false);
      toast.success(`Order corrected — new total ${money(result.grandTotal)}.`, {
        description: result.overpaid > 0 ? `Customer has overpaid ${money(result.overpaid)}.` : undefined,
      });
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not correct this order.'),
  });

  /**
   * Draft → Confirmed through the same confirm endpoint as New Sales Order: it
   * rechecks live stock, deducts each SKU exactly once and is idempotent,
   * because the key is derived from the order id.
   */
  const confirmDraft = useMutation({
    mutationFn: () => {
      if (data.status !== 'Draft') throw new Error('This order is already confirmed.');
      return confirmSalesOrder({
        orderId: data.id,
        idempotencyKey: `confirm:${data.id}`,
        customerId: data.customerId,
        customerName: data.customerName,
        phone: data.phone,
        area: area.trim() || data.area,
        address: address.trim() || data.address,
        landmark: data.landmark ?? null,
        fulfilmentMethod: data.fulfilmentMethod,
        deliveryCharge: data.deliveryCharge,
        deliveryDate: pickup ? null : deliveryDate || data.deliveryDate || null,
        courier: pickup ? null : courier,
        trackingNumber: pickup ? null : trackingNumber,
        deliveryNotes: pickup ? null : deliveryNotes,
        pickupDate: pickup ? pickupDate || data.pickupDate || null : null,
        pickupTime: pickup ? pickupTime : null,
        pickupNotes: pickup ? pickupNotes : null,
        paymentMode,
        paymentStatus,
        amountReceived: Number(amountReceived) || 0,
        paymentDate: data.paymentDate ?? null,
        paymentTime: data.paymentTime ?? null,
        paymentReference,
        paymentNotes,
        paymentHeldIn,
        paymentHolderDetails,
        items: data.items.map((i) => ({
          key: `${i.productId}:${i.variantIndex ?? 'base'}`,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          consignment: i.isConsignment
            ? {
                partner: i.consignmentPartner ?? '',
                productCost: i.consignmentProductCost ?? 0,
                opPercent: i.consignmentOpPercent ?? 0,
                opMin: i.consignmentOpMin ?? 0,
                otherCost: i.consignmentOtherCost ?? 0,
              }
            : null,
        })),
      });
    },
    onSuccess: async (result) => {
      setEditDraft(false);
      toast.success(
        result.duplicate
          ? 'This order was already confirmed — stock was not deducted again.'
          : 'Order confirmed and stock deducted',
      );
      await refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not confirm this order.'),
  });

  /** Opens the isolated one-page label view. Never touches stock or order state. */
  const openLabel = async (autoprint) => {
    storeLabelSize(labelSize);
    window.open(deliveryLabelUrl(data.id, labelSize, autoprint), '_blank', 'noopener,noreferrer');
    try {
      await recordLabelPrint(data.id, labelSize);
      await queryClient.invalidateQueries({ queryKey: ['femnia', 'orders'] });
    } catch {
      /* print-count bookkeeping only; printing must still work */
    }
  };

  const doPrint = () => {
    printDocument('invoice', labelSize);
    recordInvoicePrint(data.id).catch(() => {
      /* activity-log bookkeeping only */
    });
  };

  const returnable = data.items.filter((i) => i.quantity - (i.returnedQty ?? 0) > 0);

  return (
    <>
      <div className="space-y-5 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={data.status} />
          <StatusBadge value={data.paymentStatus} />
          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{data.fulfilmentMethod}</span>
          {data.channel && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{data.channel}</span>}
          <span className="text-xs text-muted-foreground">{new Date(data.orderDate).toLocaleString('en-GB')}</span>
        </div>

        {readOnly && (
          <p className="card-surface p-4 text-sm text-muted-foreground">
            Till sale — returns and voids are handled at the till.
          </p>
        )}

        <div className="card-surface p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                {data.customerName}
                {data.customerCode && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{data.customerCode}</span>
                )}
              </p>
              <p className="text-muted-foreground">{data.phone}</p>
              {data.area && <p className="text-muted-foreground">{data.area}</p>}
              {data.address && <p className="whitespace-pre-line text-muted-foreground">{data.address}</p>}
              {data.landmark && <p className="text-muted-foreground">Landmark: {data.landmark}</p>}
            </div>
            {canEditContact && (
              <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={openContactEdit}>
                <Pencil className="mr-2 size-4" /> Edit details
              </Button>
            )}
          </div>
          {!readOnly && canUpdate && !canEditContact && (
            <p className="mt-2 text-xs text-muted-foreground">
              {isCancelled
                ? 'Cancelled orders cannot be edited.'
                : 'This order is completed — only an Admin can correct these details.'}
            </p>
          )}
        </div>

        <div className="card-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">Rate</th>
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i, idx) => (
                <tr key={`${i.sku}-${idx}`} className="border-t border-border">
                  <td className="p-2">
                    <p className="font-medium">{i.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.sku} · {i.size || '—'} · {i.color || '—'}
                      {i.returnedQty ? ` · returned ${i.returnedQty}` : ''}
                    </p>
                    {i.isConsignment && <ConsignmentLine item={i} cancelled={data.status === 'Cancelled'} />}
                  </td>
                  <td className="p-2 text-right">{i.quantity}</td>
                  <td className="p-2 text-right">{i.unitPrice.toFixed(2)}</td>
                  <td className="p-2 text-right">{i.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 border-t border-border p-3 text-sm">
            <p className="flex justify-between">
              <span>Items total</span> <span>{money(data.itemsBeforeDiscount)}</span>
            </p>
            <p className="flex justify-between">
              <span>Discount</span> <span>-{money(data.totalDiscount)}</span>
            </p>
            <p className="flex justify-between">
              <span>Delivery charge</span> <span>{money(data.deliveryCharge)}</span>
            </p>
            <p className="flex justify-between font-semibold">
              <span>Grand total</span> <span>{money(data.grandTotal)}</span>
            </p>
            <p className="flex justify-between">
              <span>Received</span> <span>{money(data.amountReceived)}</span>
            </p>
            <p className="flex justify-between font-semibold text-primary">
              <span>Balance</span> <span>{money(data.remainingBalance)}</span>
            </p>
          </div>
        </div>

        {/* online orders: gateway & coupon, refunds, Shiprocket, PDF invoice */}
        {isWeb && <WebOrderPanel data={data} onChanged={refresh} />}

        {/* fulfilment + payment */}
        {!readOnly && (canUpdate || canPayments) && (!isDraft || editDraft) && (
          <div className="card-surface space-y-3 p-4">
            <h3 className="text-sm font-semibold">Fulfilment &amp; payment</h3>
            {isDraft && canUpdate && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="d-area">Area</Label>
                  <Input id="d-area" value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 h-11" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="d-address">Delivery address</Label>
                  <Textarea id="d-address" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" rows={2} />
                </div>
              </div>
            )}
            {canUpdate && (
              <>
                {!isDraft && (
                  <div>
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="mt-1 h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(flow.includes(status) ? flow : [status, ...flow]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {pickup ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="d-pdate">Pickup date</Label>
                      <Input id="d-pdate" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="mt-1 h-11" />
                    </div>
                    <div>
                      <Label htmlFor="d-ptime">Pickup time</Label>
                      <Input id="d-ptime" type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="mt-1 h-11" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="d-pnotes">Pickup notes</Label>
                      <Textarea id="d-pnotes" value={pickupNotes} onChange={(e) => setPickupNotes(e.target.value)} className="mt-1" rows={2} />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="d-ddate">Delivery date</Label>
                      <Input id="d-ddate" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="mt-1 h-11" />
                    </div>
                    <div>
                      <Label htmlFor="d-courier">Courier / driver</Label>
                      <Input id="d-courier" value={courier} onChange={(e) => setCourier(e.target.value)} className="mt-1 h-11" />
                    </div>
                    <div>
                      <Label htmlFor="d-track">Tracking number</Label>
                      <Input id="d-track" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="mt-1 h-11" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="d-dnotes">Delivery notes</Label>
                      <Textarea id="d-dnotes" value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} className="mt-1" rows={2} />
                    </div>
                  </div>
                )}
              </>
            )}

            {canPayments && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Payment method</Label>
                  <Select value={paymentMode} onValueChange={setPaymentMode}>
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALES_PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment status</Label>
                  <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SALES_PAYMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="d-received">Amount received</Label>
                  <Input id="d-received" value={amountReceived} inputMode="decimal" onChange={(e) => setAmountReceived(e.target.value)} className="mt-1 h-11" />
                </div>
                <div>
                  <Label htmlFor="d-ref">Transaction reference</Label>
                  <Input id="d-ref" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 h-11" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Money received in / held by</Label>
                  <Select value={paymentHeldIn} onValueChange={setPaymentHeldIn}>
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(PAYMENT_HELD_IN_OPTIONS.includes(paymentHeldIn)
                        ? PAYMENT_HELD_IN_OPTIONS
                        : [paymentHeldIn, ...PAYMENT_HELD_IN_OPTIONS]
                      ).map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="d-holder">Holder / location details</Label>
                  <Input id="d-holder" value={paymentHolderDetails} onChange={(e) => setPaymentHolderDetails(e.target.value)} className="mt-1 h-11" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="d-paynotes">Payment notes</Label>
                  <Textarea id="d-paynotes" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="mt-1" rows={2} />
                </div>
              </div>
            )}

            {isDraft ? (
              <p className="text-xs text-muted-foreground">These details are saved when you press Confirm Order below.</p>
            ) : (
              <>
                {isWeb && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={emailCustomer} onCheckedChange={(v) => setEmailCustomer(v === true)} />
                    Email the customer when the status changes
                  </label>
                )}
                <Button className="h-11 w-full" disabled={save.isPending} onClick={() => save.mutate()}>
                  {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save fulfilment &amp; payment
                </Button>
                <p className="text-xs text-muted-foreground">
                  Editing these fields never changes stock. Use Return or Cancel for stock corrections.
                </p>
              </>
            )}
          </div>
        )}

        {/* printing — only once the order is confirmed */}
        {isDraft ? (
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold">Print</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Invoices and delivery labels become available after you confirm this order.
            </p>
          </div>
        ) : (
          <div className="card-surface space-y-3 p-4">
            <h3 className="text-sm font-semibold">Print</h3>
            <div className="flex flex-wrap items-center gap-2">
              {canPrintInvoice && (
                <Button variant="outline" className="h-11" onClick={doPrint}>
                  <Printer className="mr-2 size-4" /> A4 invoice
                </Button>
              )}
              {canPrintLabel && !pickup && (
                <>
                  <Select value={labelSize} onValueChange={setChosenLabelSize}>
                    <SelectTrigger className="h-11 w-[150px]" aria-label="Label size">
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
                  <Button variant="outline" className="h-11" onClick={() => void openLabel(false)}>
                    <Eye className="mr-2 size-4" /> Preview delivery label
                  </Button>
                  <Button variant="outline" className="h-11" onClick={() => void openLabel(true)}>
                    <Tag className="mr-2 size-4" /> Print label
                  </Button>
                  <Button variant="outline" className="h-11" onClick={() => void openLabel(true)}>
                    <Download className="mr-2 size-4" /> Save as PDF
                  </Button>
                </>
              )}
              {pickup && <p className="text-xs text-muted-foreground">Pickup orders do not use delivery labels.</p>}
            </div>
            {canPrintLabel && !pickup && (
              <p className="text-xs text-muted-foreground">
                The label opens as an isolated one-page {labelSize.replace('x', ' × ')} mm sheet. Printing or reprinting
                never changes stock, payments or delivery status.
              </p>
            )}
          </div>
        )}

        {/* returns & cancellation */}
        {!readOnly && (canReturns || canCancel) && data.status !== 'Draft' && (
          <div className="card-surface flex flex-wrap gap-2 p-4">
            {canReturns && returnable.length > 0 && !isCancelled && (
              <Button variant="outline" className="h-11" onClick={() => setReturnOpen(true)}>
                Process return
              </Button>
            )}
            {canCancel && data.status !== 'Cancelled' && (
              <Button variant="destructive" className="h-11" onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            )}
            {canCorrectPrices && data.status !== 'Cancelled' && (
              <Button variant="outline" className="h-11" onClick={openPriceEdit}>
                <Pencil className="mr-2 size-4" /> Correct prices
              </Button>
            )}
          </div>
        )}

        {/* audit */}
        {canAudit && (
          <div className="card-surface p-4">
            <h3 className="text-sm font-semibold">Change history</h3>
            {audit.isPending && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
            {!audit.isPending && !(audit.data ?? []).length && (
              <p className="mt-2 text-sm text-muted-foreground">No changes recorded yet.</p>
            )}
            <ul className="mt-2 space-y-2 text-xs">
              {(audit.data ?? []).map((a) => (
                <li key={a.id} className="rounded-lg bg-secondary/40 p-2">
                  <p className="font-medium">{a.field}</p>
                  <p className="text-muted-foreground">
                    {a.oldValue ?? '—'} → {a.newValue ?? '—'}
                  </p>
                  <p className="text-muted-foreground">
                    {a.staffName ?? 'Staff'} · {new Date(a.createdAt).toLocaleString('en-GB')}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Draft actions: sticky so Confirm is always reachable. */}
        {/* An online order still awaiting payment is confirmed by the store checkout, never here. */}
        {isDraft && !readOnly && data.channel !== 'Online' && (
          <div className="sticky bottom-0 -mx-4 mt-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap gap-2">
              {(canUpdate || canPayments) && (
                <Button variant="outline" className="h-11 flex-1" onClick={() => setEditDraft((v) => !v)}>
                  {editDraft ? 'Hide edit fields' : 'Edit Order'}
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  className="h-11 flex-1 text-destructive"
                  onClick={() => {
                    setCancelRestock(false);
                    setCancelOpen(true);
                  }}
                >
                  Cancel Draft
                </Button>
              )}
              {canConfirm && (
                <Button
                  className="h-11 flex-1"
                  disabled={confirmDraft.isPending || confirmDraft.isSuccess}
                  onClick={() => confirmDraft.mutate()}
                >
                  {confirmDraft.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Confirm Order
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Confirming rechecks live stock and deducts each product once. Payment status stays separate and a future
              delivery date is kept.
            </p>
          </div>
        )}
      </div>

      {/* Dialogs portal out of the sheet so they always sit on top. */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="z-[70] max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Customer &amp; Delivery Details</DialogTitle>
            <DialogDescription>
              Corrects only the saved customer and address details on this order. Items, prices, payment, totals and
              status stay exactly as they are; reprints use the corrected details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="c-name">Customer name</Label>
                <Input id="c-name" value={cName} onChange={(e) => setCName(e.target.value)} className="mt-1 h-11" />
              </div>
              <div>
                <Label htmlFor="c-phone">Mobile number</Label>
                <Input id="c-phone" value={cPhone} inputMode="tel" onChange={(e) => setCPhone(e.target.value)} className="mt-1 h-11" />
              </div>
              <div>
                <Label htmlFor="c-area">Area</Label>
                <Input id="c-area" value={cArea} onChange={(e) => setCArea(e.target.value)} className="mt-1 h-11" />
              </div>
              <div>
                <Label htmlFor="c-landmark">Landmark</Label>
                <Input id="c-landmark" value={cLandmark} onChange={(e) => setCLandmark(e.target.value)} className="mt-1 h-11" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="c-address">Full address</Label>
                <Textarea id="c-address" value={cAddress} onChange={(e) => setCAddress(e.target.value)} className="mt-1" rows={2} />
              </div>
              <div>
                <Label htmlFor="c-date">{pickup ? 'Pickup date' : 'Scheduled delivery date'}</Label>
                <Input id="c-date" type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} className="mt-1 h-11" />
              </div>
              {pickup && (
                <div>
                  <Label htmlFor="c-time">Pickup time</Label>
                  <Input id="c-time" type="time" value={cTime} onChange={(e) => setCTime(e.target.value)} className="mt-1 h-11" />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="c-notes">{pickup ? 'Pickup notes' : 'Delivery notes'}</Label>
                <Textarea id="c-notes" value={cNotes} onChange={(e) => setCNotes(e.target.value)} className="mt-1" rows={2} />
              </div>
            </div>
            {canEditCustomerProfile && data.customerId && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={cAlsoCustomer} onCheckedChange={(v) => setCAlsoCustomer(Boolean(v))} />
                Also update customer profile
              </label>
            )}
            {contactLocked && (
              <div>
                <Label htmlFor="c-reason">Reason for this correction (required)</Label>
                <Textarea id="c-reason" value={cReason} onChange={(e) => setCReason(e.target.value)} className="mt-1" rows={2} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Every change is recorded in the order change history with the old value, the new value, your name and the
              time.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContactOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saveContact.isPending || (contactLocked && !cReason.trim())} onClick={() => saveContact.mutate()}>
              {saveContact.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent className="z-[70] max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Correct prices &amp; discounts</DialogTitle>
            <DialogDescription>
              Corrects unit prices, item discounts, the order discount and the delivery charge on this confirmed order.
              Sold quantities, SKUs, recorded costs and stock never change, and every correction is audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {priceLines.map((line, index) => (
              <div key={line.id} className="rounded-2xl border border-border p-3">
                <p className="mb-2 text-sm font-medium text-foreground">
                  {line.name} <span className="text-xs text-muted-foreground">× {line.quantity}</span>
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Unit price (QAR)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setPriceLines((prev) => prev.map((l, i) => (i === index ? { ...l, unitPrice: e.target.value } : l)))
                      }
                      className="mt-1 h-11"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Item discount (QAR)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.discount}
                      onChange={(e) =>
                        setPriceLines((prev) => prev.map((l, i) => (i === index ? { ...l, discount: e.target.value } : l)))
                      }
                      className="mt-1 h-11"
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Order discount type</Label>
                <select
                  value={pDiscountType}
                  onChange={(e) => setPDiscountType(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="amount">QAR amount</option>
                  <option value="percent">Percentage</option>
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Order discount</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pDiscountValue}
                  onChange={(e) => setPDiscountValue(e.target.value)}
                  className="mt-1 h-11"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Delivery charge (QAR)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pDelivery}
                  onChange={(e) => setPDelivery(e.target.value)}
                  disabled={pickup}
                  className="mt-1 h-11"
                />
              </div>
            </div>

            <div className="rounded-2xl bg-secondary/50 p-3 text-sm">
              <Line label="Items after item discounts" value={money(priceTotals.net)} />
              <Line label="Order discount" value={`− ${money(priceTotals.orderDiscount)}`} />
              <Line label="Subtotal" value={money(priceTotals.subtotal)} />
              <Line label="Delivery" value={money(priceTotals.delivery)} />
              <Line label="New payable total" value={money(priceTotals.grandTotal)} />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Reason for this correction *</Label>
              <Textarea value={pReason} onChange={(e) => setPReason(e.target.value)} rows={2} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-11" onClick={() => setPriceOpen(false)}>
              Cancel
            </Button>
            <Button className="h-11" onClick={() => savePrices.mutate()} disabled={savePrices.isPending || !pReason.trim()}>
              {savePrices.isPending ? 'Saving…' : 'Save correction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="z-[70] max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Process return</DialogTitle>
            <DialogDescription>Stock goes back into inventory only for lines marked “Restock”.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {returnable.map((i) => {
              const k = String(i.lineIndex);
              const line = returnLines[k] ?? { quantity: '0', reason: RETURN_REASONS[0], restock: true };
              const max = i.quantity - (i.returnedQty ?? 0);
              return (
                <div key={k} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.sku} · up to {max} returnable
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        value={line.quantity}
                        inputMode="numeric"
                        onChange={(e) =>
                          setReturnLines((prev) => ({
                            ...prev,
                            [k]: { ...line, quantity: String(Math.min(Math.max(Number(e.target.value) || 0, 0), max)) },
                          }))
                        }
                        className="mt-1 h-10"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Reason</Label>
                      <Select
                        value={line.reason}
                        onValueChange={(v) => setReturnLines((prev) => ({ ...prev, [k]: { ...line, reason: v } }))}
                      >
                        <SelectTrigger className="mt-1 h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[80]">
                          {RETURN_REASONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={line.restock}
                      onCheckedChange={(v) => setReturnLines((prev) => ({ ...prev, [k]: { ...line, restock: Boolean(v) } }))}
                    />
                    Restock into inventory
                  </label>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>
              Close
            </Button>
            <Button disabled={returns.isPending} onClick={() => returns.mutate()}>
              {returns.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="z-[70] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel order</DialogTitle>
            <DialogDescription>
              Cancelling keeps the order record. Stock is restored only once, and only if you choose to.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cancel-reason">Reason</Label>
              <Textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-1" rows={3} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={cancelRestock} onCheckedChange={(v) => setCancelRestock(Boolean(v))} />
              Restore the deducted stock
            </label>
            {data.restockedAt && (
              <p className="text-xs text-muted-foreground">
                Stock for this order was already restored earlier — it will not be restored twice.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" disabled={cancel.isPending || !cancelReason.trim()} onClick={() => cancel.mutate()}>
              {cancel.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* print surface */}
      <div aria-hidden className="print-only">
        <InvoiceSheet order={data} business={printBusiness} />
      </div>
    </>
  );
}

function ConsignmentLine({ item: i, cancelled }) {
  const netQty = cancelled ? 0 : Math.max(i.quantity - (i.returnedQty ?? 0), 0);
  const netValue = i.quantity > 0 ? (i.lineTotal / i.quantity) * netQty : 0;
  const s = computeConsignment(
    {
      partner: i.consignmentPartner ?? '',
      productCost: i.consignmentProductCost ?? 0,
      opPercent: i.consignmentOpPercent ?? 0,
      opMin: i.consignmentOpMin ?? 0,
      otherCost: i.consignmentOtherCost ?? 0,
    },
    netQty,
    netValue,
  );
  return (
    <p className="mt-1 text-xs text-primary">
      Consignment · {i.consignmentPartner || 'Partner'} · product cost {money(s.productCost)} · OP {money(s.opCost)} ·
      other {money(s.otherCost)} · FEMNIA {money(s.femniaTotal)} · partner {money(s.partnerTotal)}
    </p>
  );
}

function Line({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
