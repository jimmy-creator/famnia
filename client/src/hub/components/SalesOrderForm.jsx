/**
 * New Sales Order (POS style).
 *
 * Stock is deducted only when Confirm succeeds, and only through the shared
 * confirmSalesOrder() call, which rechecks live stock and is idempotent.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Minus, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { CustomerPicker } from '@/hub/components/CustomerPicker';
import { ErrorState, LoadingRows, PageHeader } from '@/hub/components/shared';
import { Badge } from '@/hub/ui/badge';
import { Button } from '@/hub/ui/button';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Switch } from '@/hub/ui/switch';
import { Textarea } from '@/hub/ui/textarea';
import { computeConsignment, emptyConsignment } from '@/hub/lib/consignment';
import {
  accessQuery,
  appSettingsQuery,
  confirmSalesOrder,
  createOrReuseCustomer,
  customerHistoryQuery,
  findCustomerByPhone,
  newIdempotencyKey,
  productsQuery,
  qk,
  saveSalesOrderDraft,
} from '@/hub/lib/api';
import { can } from '@/hub/lib/permissions';
import { clearCart, getCart, setCart } from '@/hub/lib/cart';
import {
  FULFILMENT_METHODS,
  PAYMENT_HELD_IN_OPTIONS,
  SALES_PAYMENT_METHODS,
  SALES_PAYMENT_STATUSES,
} from '@/hub/lib/sales';

const money = (v) => `QAR ${v.toFixed(2)}`;

/** Live consignment split for one cart line. Delivery charges are excluded. */
function ConsignmentFields({ value, quantity, netLineTotal, onChange, canOverrideCost }) {
  const split = computeConsignment(value, quantity, netLineTotal);
  const numeric = (v) => Math.max(Number(v) || 0, 0);
  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs">Partner</Label>
          <Input
            value={value.partner ?? ''}
            onChange={(e) => onChange({ partner: e.target.value })}
            placeholder="Partner name"
            className="mt-1 h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Product cost / pc</Label>
          <Input
            value={value.productCost}
            inputMode="decimal"
            readOnly={!canOverrideCost}
            title={canOverrideCost ? undefined : 'Only an Admin can change the product cost.'}
            onChange={(e) => onChange({ productCost: numeric(e.target.value) })}
            className={`mt-1 h-9 ${canOverrideCost ? '' : 'bg-muted/60'}`}
          />
        </div>
        <div>
          <Label className="text-xs">OP cost %</Label>
          <Input
            value={value.opPercent}
            inputMode="decimal"
            onChange={(e) => onChange({ opPercent: numeric(e.target.value) })}
            className="mt-1 h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Min OP cost (QAR)</Label>
          <Input
            value={value.opMin}
            inputMode="decimal"
            onChange={(e) => onChange({ opMin: numeric(e.target.value) })}
            className="mt-1 h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Other cost / pc (QAR)</Label>
          <Input
            value={value.otherCost}
            inputMode="decimal"
            onChange={(e) => onChange({ otherCost: numeric(e.target.value) })}
            className="mt-1 h-9"
          />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Net sales ({split.quantity} pc)</dt>
        <dd className="text-right font-medium">{money(split.netSales)}</dd>
        <dt className="text-muted-foreground">Product cost total ({split.quantity} × cost/pc)</dt>
        <dd className="text-right">{money(split.productCost)}</dd>

        <dt className="text-muted-foreground">OP cost</dt>
        <dd className="text-right">{money(split.opCost)}</dd>
        <dt className="text-muted-foreground">Other cost</dt>
        <dd className="text-right">{money(split.otherCost)}</dd>
        <dt className="text-muted-foreground">Remaining profit</dt>
        <dd className="text-right font-medium">{money(split.remainingProfit)}</dd>
        <dt className="font-semibold">FEMNIA receives</dt>
        <dd className="text-right font-semibold">{money(split.femniaTotal)}</dd>
        <dt className="font-semibold">Partner receives</dt>
        <dd className="text-right font-semibold">{money(split.partnerTotal)}</dd>
      </dl>
      {split.remainingProfit < 0 && (
        <p className="text-xs text-destructive">Costs exceed the selling value — the shortfall is shared equally.</p>
      )}
    </div>
  );
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Same arithmetic as the server's computeTotals (server/src/hub/sales.js). */
function computeTotals(lines, deliveryCharge) {
  const out = lines.map((l) => ({ ...l, lineTotal: round2(Math.max(l.quantity * l.unitPrice - l.discount, 0)) }));
  const subtotal = round2(out.reduce((s, l) => s + l.lineTotal, 0));
  return {
    lines: out,
    itemsBeforeDiscount: round2(out.reduce((s, l) => s + l.quantity * l.unitPrice, 0)),
    totalDiscount: round2(out.reduce((s, l) => s + l.discount, 0)),
    subtotal,
    grandTotal: round2(subtotal + Math.max(deliveryCharge, 0)),
  };
}

/**
 * Spreads one order-level discount proportionally over the cart lines by
 * adding to each line's own discount, so invoices, reports, returns and
 * consignment splits all read the same single set of line values.
 */
function allocateOrderDiscount(lines, orderDiscount) {
  if (orderDiscount <= 0 || !lines.length) return lines;
  const nets = lines.map((l) => Math.max(l.quantity * l.unitPrice - l.discount, 0));
  const subtotal = nets.reduce((s, n) => s + n, 0);
  if (subtotal <= 0) return lines;
  const capped = Math.min(orderDiscount, subtotal);
  let used = 0;
  return lines.map((l, idx) => {
    const share = idx === lines.length - 1 ? round2(capped - used) : round2((capped * (nets[idx] ?? 0)) / subtotal);
    used = round2(used + share);
    return { ...l, discount: round2(l.discount + Math.min(share, nets[idx] ?? 0)) };
  });
}

const lineFrom = (p, quantity) => ({
  key: p.key,
  sku: p.sku,
  name: p.name,
  size: p.size,
  color: p.color,
  category: p.category,
  quantity,
  unitPrice: p.sellingPriceQar,
  discount: 0,
  consignment: null,
  available: p.currentStock,
});

/** Items added from the Products list are taken over once, capped at live stock. */
function importCart(productByKey) {
  const lines = [];
  const errors = [];
  for (const entry of getCart()) {
    const p = productByKey.get(entry.key);
    if (!p || !p.isActive || p.currentStock < 1) {
      errors.push(`${p?.sku ?? entry.key} is no longer available and was left out.`);
      continue;
    }
    const quantity = Math.min(Math.floor(entry.quantity), p.currentStock);
    if (quantity < entry.quantity) errors.push(`Only ${p.currentStock} unit(s) of ${p.sku} in stock.`);
    lines.push(lineFrom(p, quantity));
  }
  return { lines, errors };
}

export function SalesOrderForm() {
  const products = useQuery(productsQuery);

  if (products.isPending) return <LoadingRows count={8} />;
  if (products.isError) {
    return (
      <ErrorState
        section="products"
        message={products.error instanceof Error ? products.error.message : 'Unknown error'}
        onRetry={() => void products.refetch()}
      />
    );
  }
  return <OrderForm products={products.data} />;
}

function OrderForm({ products }) {
  const access = useQuery(accessQuery);
  const settings = useQuery(appSettingsQuery);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const productByKey = useMemo(() => new Map(products.map((p) => [p.key, p])), [products]);

  const [imported] = useState(() => importCart(productByKey));
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState(imported.lines);
  const [orderDiscountType, setOrderDiscountType] = useState('%');
  const [orderDiscountValue, setOrderDiscountValue] = useState('0');

  const [customerId, setCustomerId] = useState(null);
  const [customerCode, setCustomerCode] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [lookupState, setLookupState] = useState('idle');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [history, setHistory] = useState([]);

  const [fulfilmentMethod, setFulfilmentMethod] = useState('Delivery');
  // null until typed: settings supply the default delivery charge for NEW orders only.
  const [deliveryChargeInput, setDeliveryCharge] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [courier, setCourier] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');

  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentStatus, setPaymentStatus] = useState('Pending');
  const [amountReceived, setAmountReceived] = useState('0');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentHeldIn, setPaymentHeldIn] = useState('Cash in Hand');
  const [paymentHolderDetails, setPaymentHolderDetails] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const deliveryCharge = deliveryChargeInput ?? String(settings.data?.defaultDeliveryCharge ?? 0);

  // Report what happened to the Products-list cart once.
  const importReported = useRef(false);
  useEffect(() => {
    if (importReported.current) return;
    importReported.current = true;
    imported.errors.forEach((message) => toast.error(message));
    if (imported.lines.length) toast.success(`${imported.lines.length} product(s) added from your cart.`);
  }, [imported]);

  /** Settings choose which action a new order leads with (Draft or Confirmed). */
  const draftFirst = (settings.data?.defaultOrderStatus ?? 'Draft') !== 'Confirmed';
  const canConfirm = can(access.data, 'orders.confirm');
  const canCreate = can(access.data, 'orders.create');

  const charge = fulfilmentMethod === 'Customer Pickup' ? 0 : Math.max(Number(deliveryCharge) || 0, 0);

  /** Order discount: one type at a time, on the item subtotal, never delivery. */
  const itemsSubtotal = useMemo(
    () => round2(lines.reduce((s, l) => s + Math.max(l.quantity * l.unitPrice - l.discount, 0), 0)),
    [lines],
  );
  const rawOrderDiscount = orderDiscountValue.trim() === '' ? 0 : Number(orderDiscountValue);
  const orderDiscountError = (() => {
    if (Number.isNaN(rawOrderDiscount)) return 'Enter a number.';
    if (rawOrderDiscount < 0) return 'Discount cannot be negative.';
    if (orderDiscountType === '%' && rawOrderDiscount > 100) return 'Percentage cannot be above 100%.';
    if (orderDiscountType === 'QAR' && rawOrderDiscount > itemsSubtotal) return 'Discount cannot be more than the item subtotal.';
    return null;
  })();
  const orderDiscount = orderDiscountError
    ? 0
    : round2(orderDiscountType === '%' ? (itemsSubtotal * rawOrderDiscount) / 100 : rawOrderDiscount);

  const pricedLines = useMemo(() => allocateOrderDiscount(lines, orderDiscount), [lines, orderDiscount]);
  const netByKey = useMemo(
    () => new Map(pricedLines.map((l) => [l.key, Math.max(l.quantity * l.unitPrice - l.discount, 0)])),
    [pricedLines],
  );
  const totals = useMemo(() => computeTotals(pricedLines, charge), [pricedLines, charge]);
  const received = Math.min(Math.max(Number(amountReceived) || 0, 0), totals.grandTotal);
  const balance = Math.max(totals.grandTotal - received, 0);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = products.filter((p) => p.isActive);
    if (!q) return all.slice(0, 8);
    return all
      .filter((p) =>
        [p.productCode, p.sku, p.name, p.category, p.size, p.color, p.shelfLocation]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 12);
  }, [products, search]);

  const addProduct = (p) => {
    const existing = lines.find((l) => l.key === p.key);
    if (existing) {
      if (existing.quantity + 1 > p.currentStock) {
        toast.error(`Only ${p.currentStock} unit(s) of ${p.sku} in stock.`);
        return;
      }
      setLines((prev) => prev.map((l) => (l.key === p.key ? { ...l, quantity: l.quantity + 1 } : l)));
      return;
    }
    if (p.currentStock < 1) {
      toast.error(`${p.sku} is out of stock.`);
      return;
    }
    setLines((prev) => [...prev, lineFrom(p, 1)]);
  };

  // Keep the basket when leaving without ordering; drop it once an order is saved or confirmed.
  const orderCompleted = useRef(false);
  const linesRef = useRef([]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  useEffect(() => {
    return () => {
      if (orderCompleted.current) {
        clearCart();
        return;
      }
      setCart(linesRef.current.map((l) => ({ key: l.key, quantity: l.quantity })));
    };
  }, []);

  /**
   * A new consignment line inherits the SKU's recorded cost price and its
   * assigned partner (the product supplier); only an Admin may override cost.
   */
  const consignmentFor = (key) => {
    const p = productByKey.get(key);
    return { ...emptyConsignment(), partner: p?.supplier ?? '', productCost: p?.costPrice ?? 0 };
  };

  const setLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const loadHistory = (id) => {
    if (!can(access.data, 'customers.history')) return;
    queryClient
      .fetchQuery(customerHistoryQuery(id))
      .then((rows) => setHistory(rows.slice(0, 5)))
      .catch(() => setHistory([]));
  };

  const lookupCustomer = async () => {
    if (!phone.trim()) return;
    setLookupState('searching');
    try {
      const found = await findCustomerByPhone(phone);
      if (!found) {
        setCustomerId(null);
        setCustomerCode(null);
        setLookupState('new');
        setHistory([]);
        return;
      }
      setCustomerId(found.id);
      setCustomerCode(found.code);
      setCustomerName(found.name);
      setAltPhone(found.altPhone ?? '');
      setArea(found.area ?? '');
      setAddress(found.address ?? '');
      setCustomerNotes(found.notes ?? '');
      setLookupState('found');
      loadHistory(found.id);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Customer lookup failed.');
      setLookupState('idle');
    }
  };

  const applyCustomer = (found) => {
    setCustomerId(found.id);
    setCustomerCode(found.code);
    setCustomerName(found.name);
    setPhone(found.phone);
    setAltPhone(found.altPhone ?? '');
    setArea(found.area ?? '');
    setAddress(found.address ?? '');
    setCustomerNotes(found.notes ?? '');
    setLookupState('found');
    loadHistory(found.id);
  };

  const resetForm = () => {
    setLines([]);
    setOrderDiscountType('%');
    setOrderDiscountValue('0');
    setSearch('');
    setCustomerId(null);
    setCustomerCode(null);
    setCustomerName('');
    setPhone('');
    setAltPhone('');
    setArea('');
    setAddress('');
    setCustomerNotes('');
    setHistory([]);
    setLookupState('idle');
    setDeliveryCharge('0');
    setDeliveryDate('');
    setCourier('');
    setDeliveryNotes('');
    setPickupDate('');
    setPickupTime('');
    setPickupNotes('');
    setPaymentMode('Cash');
    setPaymentStatus('Pending');
    setAmountReceived('0');
    setPaymentReference('');
    setPaymentHolderDetails('');
    setPaymentNotes('');
    setIdempotencyKey(newIdempotencyKey());
  };

  const buildInput = async () => {
    let id = customerId;
    if (!id && canCreate && customerName.trim() && phone.trim()) {
      const { customer, existed } = await createOrReuseCustomer({
        name: customerName,
        phone,
        altPhone,
        area,
        address,
        notes: customerNotes,
      });
      id = customer.id;
      setCustomerId(customer.id);
      setCustomerCode(customer.code);
      if (existed) toast.info(`Existing customer ${customer.code} reused — no duplicate created.`);
    }
    return {
      idempotencyKey,
      customerId: id,
      customerName,
      phone,
      area,
      address,
      fulfilmentMethod,
      deliveryCharge: charge,
      deliveryDate: deliveryDate || null,
      courier,
      deliveryNotes,
      pickupDate: pickupDate || null,
      pickupTime,
      pickupNotes,
      paymentMode,
      paymentStatus,
      amountReceived: received,
      paymentReference,
      paymentNotes,
      paymentHeldIn,
      paymentHolderDetails,
      items: pricedLines.map((l) => ({
        key: l.key,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        consignment: l.consignment ?? null,
      })),
    };
  };

  const confirm = useMutation({
    mutationFn: async () => confirmSalesOrder(await buildInput()),
    onSuccess: async ({ order, duplicate }) => {
      await queryClient.invalidateQueries({ queryKey: qk.all });
      toast.success(
        duplicate
          ? `Order ${order.id} was already confirmed — stock was not deducted twice.`
          : `Order ${order.id} confirmed. Stock updated.`,
      );
      orderCompleted.current = true; // The cart is consumed by this order, so it is cleared on unmount.
      resetForm();
      navigate(`/hub/orders?order=${encodeURIComponent(order.id)}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not confirm the order.'),
  });

  const draft = useMutation({
    mutationFn: async () => saveSalesOrderDraft(await buildInput()),
    onSuccess: async ({ orderId }) => {
      await queryClient.invalidateQueries({ queryKey: qk.orders });
      toast.success(`Draft ${orderId} saved. No stock was deducted.`);
      // The draft consumed the cart; clear it now and re-arm persistence for any new basket.
      clearCart();
      orderCompleted.current = false;
      resetForm();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save the draft.'),
  });

  const busy = confirm.isPending || draft.isPending;
  const blocking = !lines.length
    ? 'Add at least one product.'
    : !customerName.trim() || !phone.trim()
      ? 'Customer name and mobile number are required.'
      : fulfilmentMethod === 'Delivery' && !address.trim()
        ? 'A delivery address is required for Delivery orders.'
        : null;

  return (
    <div className="pb-28 lg:pb-6">
      <PageHeader
        title="New Sales Order"
        subtitle="Search products, choose Delivery or Customer Pickup, then confirm to deduct stock."
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* ---------------- cart ---------------- */}
        <section className="space-y-4">
          <div className="card-surface p-4">
            <Label htmlFor="product-search">Product search</Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="product-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SKU, name, category, size, colour or rack"
                className="h-11 pl-9"
              />
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {results.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => addProduct(p)}
                  disabled={p.currentStock < 1}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary/60 disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.productCode ? `${p.productCode} · ` : ''}
                      {p.sku} · {p.size || '—'} · {p.color || '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{money(p.sellingPriceQar)}</p>
                    <p className="text-xs text-muted-foreground">{p.currentStock} in stock</p>
                  </div>
                </button>
              ))}
              {!results.length && <p className="text-sm text-muted-foreground">No matching products.</p>}
            </div>
          </div>

          <div className="card-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-sm font-semibold">Cart</h2>
              <Badge variant="secondary">{lines.reduce((s, l) => s + l.quantity, 0)} pcs</Badge>
            </div>
            {!lines.length && <p className="mt-3 text-sm text-muted-foreground">No items yet.</p>}
            <div className="mt-3 space-y-3">
              {lines.map((l) => (
                <div key={l.key} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.sku} · {l.size || '—'} · {l.color || '—'} · {l.available} available
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${l.sku}`}
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <div className="mt-1 flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label={`Decrease ${l.sku}`}
                          onClick={() => setLine(l.key, { quantity: Math.max(l.quantity - 1, 1) })}
                        >
                          <Minus className="size-4" />
                        </Button>
                        <Input
                          value={l.quantity}
                          inputMode="numeric"
                          onChange={(e) =>
                            setLine(l.key, { quantity: Math.min(Math.max(Number(e.target.value) || 1, 1), l.available) })
                          }
                          className="h-9 w-14 text-center"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-9"
                          aria-label={`Increase ${l.sku}`}
                          onClick={() => {
                            if (l.quantity + 1 > l.available) {
                              toast.error(`Only ${l.available} unit(s) of ${l.sku} in stock.`);
                              return;
                            }
                            setLine(l.key, { quantity: l.quantity + 1 });
                          }}
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Unit price</Label>
                      <Input
                        value={l.unitPrice}
                        inputMode="decimal"
                        onChange={(e) => setLine(l.key, { unitPrice: Math.max(Number(e.target.value) || 0, 0) })}
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Discount</Label>
                      <Input
                        value={l.discount}
                        inputMode="decimal"
                        onChange={(e) => setLine(l.key, { discount: Math.max(Number(e.target.value) || 0, 0) })}
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Line total</Label>
                      <p className="mt-3 text-sm font-semibold">
                        {money(netByKey.get(l.key) ?? Math.max(l.quantity * l.unitPrice - l.discount, 0))}
                      </p>
                    </div>
                  </div>

                  {/* ---- optional consignment sale ---- */}
                  <div className="mt-3 rounded-lg border border-border bg-secondary/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`consign-${l.key}`} className="text-xs font-semibold">
                        Consignment sale
                      </Label>
                      <Switch
                        id={`consign-${l.key}`}
                        checked={Boolean(l.consignment)}
                        onCheckedChange={(on) => setLine(l.key, { consignment: on ? consignmentFor(l.key) : null })}
                      />
                    </div>
                    {l.consignment && (
                      <ConsignmentFields
                        value={l.consignment}
                        quantity={l.quantity}
                        netLineTotal={netByKey.get(l.key) ?? Math.max(l.quantity * l.unitPrice - l.discount, 0)}
                        canOverrideCost={Boolean(access.data?.isAdmin)}
                        onChange={(patch) => setLine(l.key, { consignment: { ...l.consignment, ...patch } })}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ---- order discount (item subtotal only, never delivery) ---- */}
            <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-3">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Order discount</h3>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div className="w-28">
                  <Label className="text-xs">Type</Label>
                  <Select value={orderDiscountType} onValueChange={setOrderDiscountType}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="%">%</SelectItem>
                      <SelectItem value="QAR">QAR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32">
                  <Label className="text-xs">{orderDiscountType === '%' ? 'Percentage' : 'Amount (QAR)'}</Label>
                  <Input
                    value={orderDiscountValue}
                    inputMode="decimal"
                    onChange={(e) => setOrderDiscountValue(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
                <div className="text-xs">
                  <p>
                    Item subtotal: <span className="font-semibold">{money(itemsSubtotal)}</span>
                  </p>
                  <p>
                    Order discount: <span className="font-semibold">-{money(orderDiscount)}</span>
                  </p>
                  <p>
                    Payable (before delivery): <span className="font-semibold text-primary">{money(totals.subtotal)}</span>
                  </p>
                </div>
              </div>
              {orderDiscountError && <p className="mt-2 text-xs text-destructive">{orderDiscountError}</p>}
              <p className="mt-2 text-xs text-muted-foreground">
                One type at a time, applied after item discounts and shared across items. Delivery charges are never
                discounted.
              </p>
            </div>
          </div>
        </section>

        {/* ---------------- customer / fulfilment / payment ---------------- */}
        <section className="space-y-4">
          <div className="card-surface p-4">
            <h2 className="section-title text-sm font-semibold">Customer</h2>
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="phone">Mobile number</Label>
                <div className="mt-1 flex gap-2">
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 33xxxxxx"
                    className="h-11"
                  />
                  <Button variant="outline" className="h-11" onClick={() => void lookupCustomer()}>
                    {lookupState === 'searching' ? <Loader2 className="size-4 animate-spin" /> : 'Find'}
                  </Button>
                </div>
                <Button variant="outline" className="mt-2 h-11 w-full" onClick={() => setPickerOpen(true)}>
                  <Search className="mr-2 size-4" /> Select existing customer
                </Button>
                <CustomerPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={applyCustomer} />
                {lookupState === 'found' && customerId && (
                  <p className="mt-1 text-xs text-emerald-700">Existing customer {customerCode ?? customerId} loaded.</p>
                )}
                {lookupState === 'new' && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <UserPlus className="size-3" /> New customer — saved automatically on confirm.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="cname">Full name</Label>
                <Input id="cname" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 h-11" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="alt">Alternate number</Label>
                  <Input id="alt" value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className="mt-1 h-11" />
                </div>
                <div>
                  <Label htmlFor="area">Area</Label>
                  <Input id="area" value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 h-11" />
                </div>
              </div>
              <div>
                <Label htmlFor="address">
                  Address {fulfilmentMethod === 'Delivery' ? '(required)' : '(optional for pickup)'}
                </Label>
                <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1" rows={3} />
              </div>
              {history.length > 0 && (
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Recent orders</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {history.map((h) => (
                      <li key={h.orderId} className="flex justify-between gap-2">
                        <span>{h.orderId}</span>
                        <span className="text-muted-foreground">
                          {new Date(h.date).toLocaleDateString('en-GB')} · {h.status}
                        </span>
                        <span className="font-medium">{money(h.grandTotal)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="card-surface p-4">
            <h2 className="section-title text-sm font-semibold">Fulfilment</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {FULFILMENT_METHODS.map((m) => (
                <Button
                  key={m}
                  variant={fulfilmentMethod === m ? 'default' : 'outline'}
                  className="h-11"
                  onClick={() => setFulfilmentMethod(m)}
                >
                  {m}
                </Button>
              ))}
            </div>
            {fulfilmentMethod === 'Delivery' ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="dcharge">Delivery charge</Label>
                    <Input
                      id="dcharge"
                      value={deliveryCharge}
                      inputMode="decimal"
                      onChange={(e) => setDeliveryCharge(e.target.value)}
                      className="mt-1 h-11"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ddate">Delivery date</Label>
                    <Input id="ddate" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="mt-1 h-11" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="courier">Courier / driver</Label>
                  <Input
                    id="courier"
                    list="courier-options"
                    value={courier}
                    onChange={(e) => setCourier(e.target.value)}
                    className="mt-1 h-11"
                  />
                  <datalist id="courier-options">
                    {(settings.data?.courierNames ?? []).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <Label htmlFor="dnotes">Delivery notes</Label>
                  <Textarea id="dnotes" value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} className="mt-1" rows={2} />
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="pdate">Pickup date</Label>
                    <Input id="pdate" type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="mt-1 h-11" />
                  </div>
                  <div>
                    <Label htmlFor="ptime">Pickup time</Label>
                    <Input id="ptime" type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="mt-1 h-11" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="pnotes">Pickup notes</Label>
                  <Textarea id="pnotes" value={pickupNotes} onChange={(e) => setPickupNotes(e.target.value)} className="mt-1" rows={2} />
                </div>
                <p className="text-xs text-muted-foreground">Pickup orders have no delivery charge and no delivery label.</p>
              </div>
            )}
          </div>

          <div className="card-surface p-4">
            <h2 className="section-title text-sm font-semibold">Payment</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Method</Label>
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
                <Label>Status</Label>
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
                <Label htmlFor="received">Amount received</Label>
                <Input
                  id="received"
                  value={amountReceived}
                  inputMode="decimal"
                  onChange={(e) => setAmountReceived(e.target.value)}
                  className="mt-1 h-11"
                />
              </div>
              <div>
                <Label htmlFor="ref">Transaction reference</Label>
                <Input id="ref" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="mt-1 h-11" />
              </div>
              <div className="sm:col-span-2">
                <Label>Money received in / held by</Label>
                <Select value={paymentHeldIn} onValueChange={setPaymentHeldIn}>
                  <SelectTrigger className="mt-1 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(settings.data?.paymentHolders ?? PAYMENT_HELD_IN_OPTIONS).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="holder">Holder / location details</Label>
                <Input
                  id="holder"
                  value={paymentHolderDetails}
                  onChange={(e) => setPaymentHolderDetails(e.target.value)}
                  placeholder="e.g. driver name, staff name, account name"
                  className="mt-1 h-11"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="paynotes">Payment notes</Label>
                <Textarea id="paynotes" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="mt-1" rows={2} />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---------------- sticky summary ---------------- */}
      <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur lg:static lg:mt-4 lg:rounded-2xl lg:border lg:p-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <p>
              Items: <span className="font-semibold">{money(totals.itemsBeforeDiscount)}</span>
            </p>
            <p>
              Discount: <span className="font-semibold">-{money(totals.totalDiscount)}</span>
            </p>
            <p>
              Delivery: <span className="font-semibold">{money(charge)}</span>
            </p>
            <p>
              Balance: <span className="font-semibold">{money(balance)}</span>
            </p>
            <p className="col-span-2 text-base sm:col-span-4">
              Grand total: <span className="font-semibold text-primary">{money(totals.grandTotal)}</span>
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            {canCreate && (
              <Button
                variant={draftFirst ? 'default' : 'outline'}
                className="h-11 flex-1 sm:flex-none"
                disabled={busy || !lines.length}
                onClick={() => draft.mutate()}
              >
                Save draft
              </Button>
            )}
            <Button
              variant={draftFirst ? 'outline' : 'default'}
              className="h-11 flex-1 sm:flex-none"
              disabled={busy || !canConfirm || Boolean(blocking)}
              onClick={() => confirm.mutate()}
              title={blocking ?? undefined}
            >
              {confirm.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm order
            </Button>
          </div>
        </div>
        {blocking && <p className="mx-auto mt-2 max-w-6xl text-xs text-muted-foreground">{blocking}</p>}
        {!canConfirm && (
          <p className="mx-auto mt-1 max-w-6xl text-xs text-muted-foreground">You do not have permission to confirm orders.</p>
        )}
      </div>
    </div>
  );
}
