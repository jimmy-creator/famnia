import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Check,
  EyeOff,
  ImageIcon,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { useTheme } from '@/context/ThemeContext';
import { EmptyState, ErrorState, Kpi, LoadingRows, PageHeader } from '@/hub/components/shared';
import { accessQuery, uploadProductImage } from '@/hub/lib/api';
import {
  abandonedQuery,
  addReview,
  b2bQuotesQuery,
  couponsQuery,
  deleteAbandonedCart,
  deleteCoupon,
  deleteReview,
  gatewaysQuery,
  markQuotePaid,
  productNamesQuery,
  reviewsQuery,
  saveCoupon,
  saveSetting,
  sendQuote,
  sendRecoveryEmail,
  setQuoteStatus,
  settingQuery,
  sk,
  storeCategoriesQuery,
  toggleReviewApproval,
} from '@/hub/lib/apiStore';
import { QAR } from '@/hub/lib/format';
import { useHubTitle } from '@/hub/lib/useHubTitle';
import { STORE_TZ } from '@/lib/storeTime';
import { cn } from '@/lib/utils';
import { Badge } from '@/hub/ui/badge';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Switch } from '@/hub/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/hub/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/hub/ui/tabs';
import { Textarea } from '@/hub/ui/textarea';

/** Tabs of the online-store page and the classic area key each needs. */
const TABS = [
  { value: 'coupons', label: 'Coupons', need: 'coupons' },
  { value: 'reviews', label: 'Reviews', need: 'reviews' },
  { value: 'abandoned', label: 'Abandoned carts', need: 'orders' },
  { value: 'b2b', label: 'B2B quotes', need: 'orders' },
  { value: 'theme', label: 'Theme & banners', need: 'settings' },
];

const fmtDate = (d, withTime = false) =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        timeZone: STORE_TZ,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
      })
    : '—';

const num = (v) => parseFloat(v) || 0;

/** Online store (/hub/store): coupons, reviews, abandoned carts, B2B quotes, theme & banners. */
export default function StorePage() {
  useHubTitle('Online Store — FEMNIA Hub');
  const access = useQuery(accessQuery).data;
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => access?.isAdmin || access?.legacy?.includes(t.need));
  const requested = params.get('tab');
  const tab = tabs.some((t) => t.value === requested) ? requested : tabs[0]?.value;

  if (access && tabs.length === 0) {
    return (
      <div>
        <PageHeader title="Online Store" />
        <p className="text-sm text-muted-foreground">You do not have permission to open the online-store screens.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Online Store"
        subtitle="Coupons, reviews, abandoned carts, wholesale quotes and the storefront's look."
      />
      {tab && (
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList className="mb-4 h-auto flex-wrap">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="coupons">{tab === 'coupons' && <CouponsTab />}</TabsContent>
          <TabsContent value="reviews">{tab === 'reviews' && <ReviewsTab />}</TabsContent>
          <TabsContent value="abandoned">{tab === 'abandoned' && <AbandonedTab />}</TabsContent>
          <TabsContent value="b2b">{tab === 'b2b' && <B2BTab />}</TabsContent>
          <TabsContent value="theme">{tab === 'theme' && <ThemeTab />}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/* ================================ shared bits ================================ */

function TableShell({ children }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card">{children}</div>;
}

function Field({ label, hint, children, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Pill filter (All / Pending / …). */
function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function IconButton({ label, onClick, danger, disabled, children }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(danger && 'text-destructive hover:text-destructive')}
    >
      {children}
    </Button>
  );
}

/** Chip list with a picker to add more — used for coupon limits. */
function ChipPicker({ placeholder, options, selected, onChange, labelFor, emptyError }) {
  const remaining = options.filter((o) => !selected.includes(o.value));
  return (
    <div className="space-y-2">
      <Select value="" onValueChange={(v) => onChange([...selected, options.find((o) => String(o.value) === v).value])}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {remaining.map((o) => (
            <SelectItem key={o.value} value={String(o.value)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">
              {labelFor(v)}
              <button type="button" aria-label="Remove" onClick={() => onChange(selected.filter((x) => x !== v))}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-destructive">{emptyError}</p>
      )}
    </div>
  );
}

/** Upload button that hands back the uploaded image URL. */
function UploadButton({ onUploaded, children, variant = 'outline', size = 'default' }) {
  const [busy, setBusy] = useState(false);
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      await onUploaded(await uploadProductImage(file));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant={variant} size={size} asChild>
      <label className={cn('cursor-pointer', busy && 'pointer-events-none opacity-60')}>
        {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
        {children}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
    </Button>
  );
}

/* ================================== coupons ================================== */

const BLANK_COUPON = {
  code: '',
  description: '',
  type: 'percentage',
  value: '',
  minOrderAmount: '',
  maxDiscount: '',
  usageLimit: '',
  perUserLimit: '1',
  startDate: '',
  endDate: '',
  active: true,
  applicableCategories: null,
  applicableProducts: null,
  applicablePaymentMethods: null,
};

function CouponsTab() {
  const qc = useQueryClient();
  const coupons = useQuery(couponsQuery);
  const products = useQuery(productNamesQuery);
  const [editing, setEditing] = useState(null);
  const remove = useMutation({
    mutationFn: (c) => deleteCoupon(c.id),
    onSuccess: () => {
      toast.success('Coupon deleted');
      qc.invalidateQueries({ queryKey: sk.coupons });
    },
    onError: (e) => toast.error(e.message),
  });
  const productName = (pid) => products.data?.find((p) => p.id === pid)?.name ?? `#${pid}`;
  const rows = coupons.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Discount codes customers enter at checkout.</p>
        <Button onClick={() => setEditing({ ...BLANK_COUPON })}>
          <Plus className="mr-2 size-4" /> New coupon
        </Button>
      </div>
      {coupons.isPending ? (
        <LoadingRows />
      ) : coupons.isError ? (
        <ErrorState section="Coupons" message={coupons.error?.message} onRetry={() => coupons.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No coupons yet" hint="Create a code to offer a discount at checkout." />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Min order</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Valid</TableHead>
                <TableHead>Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-mono font-semibold">{c.code}</div>
                    {c.description && <div className="max-w-48 truncate text-xs text-muted-foreground">{c.description}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.type === 'percentage' ? `${num(c.value)}% off` : `${QAR(c.value)} off`}
                    {num(c.maxDiscount) > 0 && <div className="text-xs text-muted-foreground">max {QAR(c.maxDiscount)}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{num(c.minOrderAmount) > 0 ? QAR(c.minOrderAmount) : '—'}</TableCell>
                  <TableCell className="max-w-56 text-sm">
                    <div className="truncate">
                      {c.applicableProducts?.length
                        ? c.applicableProducts.map(productName).join(', ')
                        : c.applicableCategories?.length
                          ? c.applicableCategories.join(', ')
                          : 'All products'}
                    </div>
                    {c.applicablePaymentMethods?.length > 0 && (
                      <div className="truncate text-xs text-muted-foreground">Pay by {c.applicablePaymentMethods.join(', ')}</div>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {c.startDate || c.endDate ? `${c.startDate ? fmtDate(c.startDate) : '…'} – ${c.endDate ? fmtDate(c.endDate) : '…'}` : 'Always'}
                  </TableCell>
                  <TableCell>
                    {c.usedCount ?? 0}
                    {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.active ? 'default' : 'secondary'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <IconButton label="Edit" onClick={() => setEditing({ ...c })}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        danger
                        disabled={remove.isPending}
                        onClick={() => window.confirm(`Delete the coupon ${c.code}?`) && remove.mutate(c)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <CouponForm key={editing.id ?? 'new'} initial={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function CouponForm({ initial, onDone }) {
  const qc = useQueryClient();
  const products = useQuery(productNamesQuery).data ?? [];
  const categories = useQuery(storeCategoriesQuery).data ?? [];
  const gateways = useQuery(gatewaysQuery).data ?? [];
  const [form, setForm] = useState(() => ({
    ...initial,
    startDate: initial.startDate ? String(initial.startDate).slice(0, 10) : '',
    endDate: initial.endDate ? String(initial.endDate).slice(0, 10) : '',
  }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const scope = form.applicableProducts ? 'products' : form.applicableCategories ? 'categories' : 'all';

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code,
        description: form.description,
        type: form.type,
        value: form.value,
        minOrderAmount: form.minOrderAmount || 0,
        maxDiscount: (form.type === 'percentage' && form.maxDiscount) || null,
        usageLimit: form.usageLimit || null,
        perUserLimit: form.perUserLimit || 1,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        active: form.active,
        applicableCategories: form.applicableCategories?.length ? form.applicableCategories : null,
        applicableProducts: form.applicableProducts?.length ? form.applicableProducts : null,
        applicablePaymentMethods: form.applicablePaymentMethods?.length ? form.applicablePaymentMethods : null,
      };
      // Create ignores `active` (new coupons start active), so one created inactive needs a follow-up update.
      const saved = await saveCoupon(initial.id, payload);
      if (!initial.id && !form.active && saved?.id) await saveCoupon(saved.id, { active: false });
      return saved;
    },
    onSuccess: () => {
      toast.success(initial.id ? 'Coupon updated' : 'Coupon created');
      qc.invalidateQueries({ queryKey: sk.coupons });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial.id ? `Edit coupon ${initial.code}` : 'New coupon'}</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code">
            <Input
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              placeholder="SUMMER20"
              className="font-mono"
              required
            />
          </Field>
          <Field label="Description" hint="For your reference only.">
            <Input value={form.description || ''} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>

        <section className="space-y-4 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold">Discount</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type">
              <Select value={form.type} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={form.type === 'percentage' ? 'Percent off' : 'Amount off'}>
              <Input type="number" step="0.01" min="0" value={form.value} onChange={(e) => set({ value: e.target.value })} required />
            </Field>
            {form.type === 'percentage' && (
              <Field label="Max discount" hint="Leave empty for no cap.">
                <Input type="number" step="0.01" min="0" value={form.maxDiscount ?? ''} onChange={(e) => set({ maxDiscount: e.target.value })} />
              </Field>
            )}
          </div>
          <Field label="Minimum order" hint="Cart subtotal needed to use the code. Leave empty for none.">
            <Input type="number" step="0.01" min="0" value={form.minOrderAmount ?? ''} onChange={(e) => set({ minOrderAmount: e.target.value })} />
          </Field>
        </section>

        <section className="space-y-4 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold">Limits &amp; dates</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Total uses" hint="Leave empty for unlimited.">
              <Input type="number" min="0" value={form.usageLimit ?? ''} onChange={(e) => set({ usageLimit: e.target.value })} />
            </Field>
            <Field label="Uses per customer">
              <Input type="number" min="0" value={form.perUserLimit ?? ''} onChange={(e) => set({ perUserLimit: e.target.value })} />
            </Field>
            <Field label="Starts">
              <Input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            </Field>
            <Field label="Ends">
              <Input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border p-4">
          <h3 className="text-sm font-semibold">Where it applies</h3>
          <Field label="Products">
            <Select
              value={scope}
              onValueChange={(v) =>
                set({ applicableCategories: v === 'categories' ? [] : null, applicableProducts: v === 'products' ? [] : null })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="categories">Only some categories</SelectItem>
                <SelectItem value="products">Only some products</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {scope === 'categories' && (
            <ChipPicker
              placeholder="Add a category…"
              options={categories.map((c) => ({ value: c.name, label: c.name }))}
              selected={form.applicableCategories}
              onChange={(next) => set({ applicableCategories: next })}
              labelFor={(v) => v}
              emptyError="Select at least one category"
            />
          )}
          {scope === 'products' && (
            <ChipPicker
              placeholder="Add a product…"
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              selected={form.applicableProducts}
              onChange={(next) => set({ applicableProducts: next })}
              labelFor={(v) => products.find((p) => p.id === v)?.name ?? `#${v}`}
              emptyError="Select at least one product"
            />
          )}
          <Field label="Payment methods">
            <Select
              value={form.applicablePaymentMethods ? 'specific' : 'all'}
              onValueChange={(v) => set({ applicablePaymentMethods: v === 'all' ? null : [] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any payment method</SelectItem>
                <SelectItem value="specific">Only some payment methods</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {form.applicablePaymentMethods && (
            <ChipPicker
              placeholder="Add a payment method…"
              options={gateways.map((g) => ({ value: g.id, label: g.name }))}
              selected={form.applicablePaymentMethods}
              onChange={(next) => set({ applicablePaymentMethods: next })}
              labelFor={(v) => gateways.find((g) => g.id === v)?.name ?? v}
              emptyError="Select at least one payment method"
            />
          )}
        </section>

        <label className="flex items-center gap-3 text-sm">
          <Switch checked={Boolean(form.active)} onCheckedChange={(v) => set({ active: v })} />
          Active — customers can use this code
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {initial.id ? 'Save changes' : 'Create coupon'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ================================== reviews ================================== */

function Stars({ rating }) {
  return (
    <span className="whitespace-nowrap text-amber-500">
      {'★'.repeat(rating)}
      <span className="text-muted-foreground/40">{'★'.repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

function ReviewsTab() {
  const qc = useQueryClient();
  const reviews = useQuery(reviewsQuery);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const refresh = () => qc.invalidateQueries({ queryKey: sk.reviews });
  const approve = useMutation({
    mutationFn: (r) => toggleReviewApproval(r.id),
    onSuccess: (_, r) => {
      toast.success(r.approved ? 'Review hidden' : 'Review approved');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (r) => deleteReview(r.id),
    onSuccess: () => {
      toast.success('Review deleted');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const all = reviews.data ?? [];
  const rows = all.filter((r) => filter === 'all' || (filter === 'pending' ? !r.approved : r.approved));
  const pending = all.filter((r) => !r.approved).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All (${all.length})` },
            { value: 'pending', label: `Awaiting approval (${pending})` },
            { value: 'approved', label: 'Approved' },
          ]}
        />
        <Button onClick={() => setAdding(true)}>
          <Plus className="mr-2 size-4" /> Add review
        </Button>
      </div>
      {reviews.isPending ? (
        <LoadingRows />
      ) : reviews.isError ? (
        <ErrorState section="Reviews" message={reviews.error?.message} onRetry={() => reviews.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No reviews here" hint={filter === 'pending' ? 'Nothing is waiting for approval.' : undefined} />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-40 truncate">{r.Product?.name || `Product #${r.productId}`}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>
                    <Stars rating={r.rating} />
                  </TableCell>
                  <TableCell className="max-w-72 text-sm">
                    {r.title && <div className="truncate font-medium">{r.title}</div>}
                    <div className="line-clamp-2 text-muted-foreground">{r.comment}</div>
                  </TableCell>
                  <TableCell>
                    {r.adminCreated ? (
                      <Badge variant="outline">Added by staff</Badge>
                    ) : r.verified ? (
                      <Badge variant="secondary">Verified purchase</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Customer</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.approved ? 'default' : 'secondary'}>{r.approved ? 'Shown' : 'Awaiting approval'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" disabled={approve.isPending} onClick={() => approve.mutate(r)}>
                        {r.approved ? <EyeOff className="mr-1.5 size-3.5" /> : <Check className="mr-1.5 size-3.5" />}
                        {r.approved ? 'Hide' : 'Approve'}
                      </Button>
                      <IconButton
                        label="Delete"
                        danger
                        disabled={remove.isPending}
                        onClick={() => window.confirm('Delete this review?') && remove.mutate(r)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <ReviewForm onDone={() => setAdding(false)} />}
      </Dialog>
    </div>
  );
}

function ReviewForm({ onDone }) {
  const qc = useQueryClient();
  const products = useQuery(productNamesQuery).data ?? [];
  const [form, setForm] = useState({ productId: '', name: '', rating: 5, title: '', comment: '', verified: false });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = useMutation({
    mutationFn: () => addReview(form),
    onSuccess: () => {
      toast.success('Review added');
      qc.invalidateQueries({ queryKey: sk.reviews });
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Add review</DialogTitle>
        <DialogDescription>Staff-added reviews are published straight away.</DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.productId) return toast.error('Choose a product');
          save.mutate();
        }}
      >
        <Field label="Product">
          <Select value={String(form.productId)} onValueChange={(v) => set({ productId: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {products.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Reviewer name">
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} required />
        </Field>
        <Field label="Rating">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => set({ rating: n })}
                className={cn('text-2xl leading-none', n <= form.rating ? 'text-amber-500' : 'text-muted-foreground/30')}
              >
                ★
              </button>
            ))}
          </div>
        </Field>
        <Field label="Title">
          <Input value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Comment">
          <Textarea rows={4} value={form.comment} onChange={(e) => set({ comment: e.target.value })} required />
        </Field>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={form.verified} onCheckedChange={(v) => set({ verified: v })} />
          Show as &quot;Verified purchase&quot;
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Add review
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ============================== abandoned carts ============================== */

function AbandonedTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const query = useQuery(abandonedQuery(status));
  const refresh = () => qc.invalidateQueries({ queryKey: sk.abandonedAll });
  const send = useMutation({
    mutationFn: (c) => sendRecoveryEmail(c.id),
    onSuccess: () => {
      toast.success('Recovery email sent');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (c) => deleteAbandonedCart(c.id),
    onSuccess: () => {
      toast.success('Cart removed');
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = query.data?.stats ?? {};
  const carts = query.data?.carts ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Abandoned carts" value={stats.total ?? 0} />
        <Kpi label="Not contacted" value={stats.pending ?? 0} />
        <Kpi label="Email sent" value={stats.sent ?? 0} />
        <Kpi label="Recovered" value={stats.recovered ?? 0} tone="good" />
      </div>
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { value: '', label: 'All' },
          { value: 'pending', label: 'Not contacted' },
          { value: 'sent', label: 'Email sent' },
          { value: 'recovered', label: 'Recovered' },
        ]}
      />
      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState section="Abandoned carts" message={query.error?.message} onRetry={() => query.refetch()} />
      ) : carts.length === 0 ? (
        <EmptyState title="No abandoned carts" hint="Carts left at checkout show up here." />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer email</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Cart total</TableHead>
                <TableHead>Left on</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.email}</TableCell>
                  <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                    {(c.items ?? []).map((i) => i.name).join(', ')}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{QAR(c.cartTotal)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(c.createdAt, true)}</TableCell>
                  <TableCell>
                    {c.recovered ? (
                      <Badge>Recovered</Badge>
                    ) : c.emailSent ? (
                      <Badge variant="secondary">Email sent</Badge>
                    ) : (
                      <Badge variant="outline">Not contacted</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {!c.recovered && !c.emailSent && (
                        <Button size="sm" variant="outline" disabled={send.isPending} onClick={() => send.mutate(c)}>
                          <Mail className="mr-1.5 size-3.5" /> Send reminder
                        </Button>
                      )}
                      <IconButton
                        label="Delete"
                        danger
                        disabled={remove.isPending}
                        onClick={() => window.confirm('Remove this abandoned cart?') && remove.mutate(c)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
    </div>
  );
}

/* ================================ B2B quotes ================================ */

const QUOTE_STATUSES = ['pending', 'quoted', 'paid', 'cancelled', 'expired'];
const QUOTE_LABEL = { pending: 'Pending', quoted: 'Quoted', paid: 'Paid', cancelled: 'Cancelled', expired: 'Expired' };
const QUOTE_TINT = {
  pending: 'tint-peach text-[var(--tint-peach-ink)]',
  quoted: 'bg-primary/10 text-primary border-primary/20',
  paid: 'tint-mint text-[var(--tint-mint-ink)]',
  cancelled: 'tint-rose text-[var(--tint-rose-ink)]',
  expired: 'bg-muted text-muted-foreground border-border',
};

function QuoteBadge({ status }) {
  return (
    <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-medium', QUOTE_TINT[status])}>
      {QUOTE_LABEL[status] ?? status}
    </span>
  );
}

const quoteSum = (items) => items.reduce((s, i) => s + num(i.unitPrice) * (parseInt(i.quantity, 10) || 0), 0);

function B2BTab() {
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  const query = useQuery(b2bQuotesQuery(status));
  const rows = query.data ?? [];
  return (
    <div className="space-y-4">
      <Segmented
        value={status}
        onChange={setStatus}
        options={[{ value: '', label: 'All' }, ...QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_LABEL[s] }))]}
      />
      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState section="B2B quotes" message={query.error?.message} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No quote requests" hint="Wholesale requests from the storefront show up here." />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Quoted total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((q) => (
                <TableRow key={q.id} className="cursor-pointer" onClick={() => setOpen(q)}>
                  <TableCell className="font-mono font-semibold">{q.requestNumber}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDate(q.createdAt)}</TableCell>
                  <TableCell>
                    <div>{q.User?.name || '—'}</div>
                    <div className="text-xs text-muted-foreground">{q.User?.email}</div>
                  </TableCell>
                  <TableCell>{q.companyName || '—'}</TableCell>
                  <TableCell>{q.items?.length ?? 0}</TableCell>
                  <TableCell className="whitespace-nowrap">{q.quotedTotal ? QAR(q.quotedTotal) : '—'}</TableCell>
                  <TableCell>
                    <QuoteBadge status={q.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline">
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
      <Dialog open={Boolean(open)} onOpenChange={(o) => !o && setOpen(null)}>
        {open && <QuoteDialog key={open.id} quote={open} onDone={() => setOpen(null)} />}
      </Dialog>
    </div>
  );
}

function QuoteDialog({ quote, onDone }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => ({
    items: (quote.items ?? []).map((it) => ({
      productId: it.productId || null,
      name: it.name,
      quantity: parseInt(it.quantity, 10) || 1,
      unitPrice: it.unitPrice != null ? it.unitPrice : '',
      image: it.image || null,
      category: it.category || null,
    })),
    quotedTotal: quote.quotedTotal || '',
    quotedValidUntil: quote.quotedValidUntil ? String(quote.quotedValidUntil).slice(0, 10) : '',
    adminNote: quote.adminNote || '',
    internalNote: quote.internalNote || '',
    paymentMethod: quote.paymentMethod || 'online',
  }));
  const [status, setStatus] = useState(quote.status);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (idx, patch) => set({ items: form.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  const refresh = () => qc.invalidateQueries({ queryKey: sk.b2bAll });
  const autoTotal = quoteSum(form.items);

  const changeStatus = useMutation({
    mutationFn: (next) => setQuoteStatus(quote.id, next),
    onSuccess: (_, next) => {
      setStatus(next);
      toast.success(`Status set to ${QUOTE_LABEL[next] ?? next}`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const send = useMutation({
    mutationFn: () =>
      sendQuote(quote.id, {
        items: form.items.map((i) => ({
          productId: i.productId || null,
          name: i.name,
          quantity: parseInt(i.quantity, 10),
          unitPrice: num(i.unitPrice),
          lineTotal: num(i.unitPrice) * (parseInt(i.quantity, 10) || 0),
          image: i.image || null,
          category: i.category || null,
        })),
        quotedTotal: num(form.quotedTotal) || autoTotal,
        quotedValidUntil: form.quotedValidUntil || null,
        adminNote: form.adminNote,
        internalNote: form.internalNote,
        paymentMethod: form.paymentMethod,
        sendEmail: true,
      }),
    onSuccess: () => {
      toast.success('Quote sent to the customer');
      refresh();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const markPaid = useMutation({
    mutationFn: () => markQuotePaid(quote.id),
    onSuccess: () => {
      toast.success('Marked paid — the order has been created');
      refresh();
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const addr = quote.contactAddress ?? {};
  const address = [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode].filter(Boolean).join(', ');
  const busy = send.isPending || markPaid.isPending || changeStatus.isPending;

  return (
    <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-3">
          Quote {quote.requestNumber} <QuoteBadge status={status} />
        </DialogTitle>
        <DialogDescription>Requested {fmtDate(quote.createdAt, true)}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 rounded-2xl border border-border p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Customer</p>
          <p className="font-medium">{quote.User?.name || '—'}</p>
          <p className="text-muted-foreground">{quote.User?.email}</p>
          {quote.contactPhone && <p className="text-muted-foreground">{quote.contactPhone}</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Company</p>
          <p className="font-medium">{quote.companyName || '—'}</p>
          {address && <p className="text-muted-foreground">{address}</p>}
        </div>
        {quote.customerNote && (
          <div className="rounded-xl border-l-4 border-primary bg-secondary/50 p-3 sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">Customer note</p>
            <p className="mt-1 whitespace-pre-wrap">{quote.customerNote}</p>
          </div>
        )}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Items &amp; prices</h3>
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="w-32">Unit price</TableHead>
                <TableHead className="w-28 text-right">Line total</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.items.map((it, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <Input value={it.name} onChange={(e) => setItem(idx, { name: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min="1" value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" value={it.unitPrice} onChange={(e) => setItem(idx, { unitPrice: e.target.value })} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {QAR(num(it.unitPrice) * (parseInt(it.quantity, 10) || 0))}
                  </TableCell>
                  <TableCell>
                    <IconButton label="Remove item" danger onClick={() => set({ items: form.items.filter((_, i) => i !== idx) })}>
                      <X className="size-4" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set({ items: [...form.items, { productId: null, name: '', quantity: 1, unitPrice: '', image: null, category: null }] })}
        >
          <Plus className="mr-1.5 size-3.5" /> Add item
        </Button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quoted total" hint={`Items add up to ${QAR(autoTotal)}. Enter a different total to override (e.g. a discount).`}>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={form.quotedTotal}
            placeholder={autoTotal.toFixed(2)}
            onChange={(e) => set({ quotedTotal: e.target.value })}
          />
        </Field>
        <Field label="Valid until">
          <Input type="date" value={form.quotedValidUntil} onChange={(e) => set({ quotedValidUntil: e.target.value })} />
        </Field>
      </div>

      <Field label="How the customer pays">
        <Segmented
          value={form.paymentMethod}
          onChange={(v) => set({ paymentMethod: v })}
          options={[
            { value: 'online', label: 'Pay online (link in email)' },
            { value: 'bank_transfer', label: 'Bank transfer' },
          ]}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Note to customer" hint="Shown in the quote email.">
          <Textarea rows={3} value={form.adminNote} onChange={(e) => set({ adminNote: e.target.value })} />
        </Field>
        <Field label="Internal note" hint="Staff only — never sent.">
          <Textarea rows={3} value={form.internalNote} onChange={(e) => set({ internalNote: e.target.value })} />
        </Field>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
        <Field label="Status" className="w-48">
          <Select
            value={status}
            disabled={busy}
            onValueChange={(next) => {
              if (next === status) return;
              if (next === 'paid') return toast.error('Use "Mark paid" to record payment.');
              changeStatus.mutate(next);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUOTE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {QUOTE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex flex-wrap gap-2">
          {form.paymentMethod === 'bank_transfer' && status === 'quoted' && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => window.confirm('Mark this quote as paid? This creates the order.') && markPaid.mutate()}
            >
              {markPaid.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
              Mark paid
            </Button>
          )}
          <Button
            type="button"
            disabled={busy || form.items.length === 0}
            onClick={() => {
              if (form.items.some((i) => !i.name.trim())) return toast.error('Every item needs a name');
              send.mutate();
            }}
          >
            {send.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            Save &amp; send quote
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}

/* ============================== theme & banners ============================== */

function Section({ title, description, children, actions }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Loads one /settings/:name value and hands it to `render` once ready. */
function SettingLoader({ name, title, description, render }) {
  const q = useQuery(settingQuery(name));
  if (q.isPending) return <Section title={title} description={description}><LoadingRows count={2} /></Section>;
  if (q.isError) {
    return (
      <Section title={title} description={description}>
        <ErrorState section={title} message={q.error?.message} onRetry={() => q.refetch()} />
      </Section>
    );
  }
  return render(q.data);
}

/** Saves a setting and stores what the server now holds in the query cache. */
function useSaveSetting(name, toCache) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => saveSetting(name, body),
    onSuccess: (_, body) => qc.setQueryData(sk.setting(name), toCache(body)),
    onError: (e) => toast.error(e.message),
  });
}

function ThemeTab() {
  return (
    <div className="space-y-5">
      <ThemePicker />
      <ImageListSetting
        name="banners"
        bodyKey="banners"
        max={5}
        title="Home page banners"
        description="The slideshow at the top of the home page — up to 5. Add a separate mobile image for phones if you like."
        blank={(image) => ({ image, mobileImage: '', title: '', subtitle: '', link: '/products' })}
      />
      <ImageListSetting
        name="mid-banners"
        bodyKey="banners"
        max={3}
        title="Mid-page banners"
        description="Up to 3 banners shown after the Best Sellers section — for promotions, new arrivals or seasonal campaigns."
        blank={(image) => ({ image, mobileImage: '', title: '', subtitle: '', link: '/products' })}
      />
      <ImageListSetting
        name="category-cards"
        bodyKey="cards"
        max={8}
        cards
        title="Category cards"
        description="Large coloured tiles on the home page — up to 8. Each can have a background colour, image and link."
        blank={(image) => ({ title: '', bgColor: '#2c5f7d', image, mobileImage: '', link: '/products' })}
      />
      <SettingLoader
        name="announcements"
        title="Announcement bar"
        render={(data) => <AnnouncementEditor initial={Array.isArray(data) ? data : []} />}
      />
      <SettingLoader
        name="hero-seal"
        title="Hero seal"
        render={(data) => (
          <HeroSealEditor initial={{ enabled: data?.enabled !== false, text: data?.text || '' }} />
        )}
      />
      <SettingLoader
        name="b2b-bank-details"
        title="B2B bank details"
        render={(data) => <BankDetailsEditor initial={data?.value || ''} />}
      />
    </div>
  );
}

function ThemePicker() {
  const { currentTheme, changeTheme, themes } = useTheme();
  return (
    <Section title="Store theme" description="The colours and fonts every customer sees on the storefront.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {themes.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (t.id === currentTheme) return;
              changeTheme(t.id);
              toast.success(`Theme changed to "${t.name}"`);
            }}
            className={cn(
              'relative overflow-hidden rounded-xl border text-left transition-colors',
              currentTheme === t.id ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40',
            )}
          >
            <div className="h-14 w-full" style={{ background: t.vars?.['--bg'] || 'var(--muted)' }}>
              <div className="h-2 w-full" style={{ background: t.vars?.['--copper'] || 'var(--primary)' }} />
            </div>
            <div className="p-3">
              <strong className="block text-sm">{t.name}</strong>
              <span className="text-xs text-muted-foreground">{t.description}</span>
            </div>
            {currentTheme === t.id && (
              <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                Active
              </span>
            )}
          </button>
        ))}
      </div>
    </Section>
  );
}

function ImageListSetting({ name, ...props }) {
  return (
    <SettingLoader
      name={name}
      title={props.title}
      description={props.description}
      render={(data) => <ImageListEditor name={name} initial={Array.isArray(data) ? data : []} {...props} />}
    />
  );
}

/** Banners and category cards: an ordered list of images with text and a link, saved as one value. */
function ImageListEditor({ name, bodyKey, max, cards, title, description, blank, initial }) {
  const [items, setItems] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const save = useSaveSetting(name, (body) => body[bodyKey]);
  const update = (next) => {
    setItems(next);
    setDirty(true);
  };
  const patch = (idx, p) => update(items.map((it, i) => (i === idx ? { ...it, ...p } : it)));
  const move = (idx, dir) => {
    const next = [...items];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    update(next);
  };
  const noun = cards ? 'card' : 'banner';

  return (
    <Section
      title={title}
      description={description}
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {items.length} / {max}
          </span>
          {items.length < max && (
            <UploadButton size="sm" onUploaded={(url) => update([...items, blank(url)])}>
              Add {noun}
            </UploadButton>
          )}
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState title={`No ${noun}s yet`} hint={`Upload an image to add the first ${noun}.`} />
      ) : (
        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={idx} className="grid gap-4 rounded-xl border border-border p-3 md:grid-cols-[auto_1fr_auto]">
              <div className="flex gap-3">
                <ImageSlot
                  label="Desktop"
                  src={it.image}
                  bg={cards ? it.bgColor : undefined}
                  onUploaded={(url) => patch(idx, { image: url })}
                />
                <ImageSlot
                  label="Mobile"
                  src={it.mobileImage}
                  bg={cards ? it.bgColor : undefined}
                  optional
                  onUploaded={(url) => patch(idx, { mobileImage: url })}
                  onClear={() => patch(idx, { mobileImage: '' })}
                />
              </div>
              <div className="grid content-start gap-3 sm:grid-cols-2">
                <Field label="Title">
                  <Input value={it.title || ''} onChange={(e) => patch(idx, { title: e.target.value })} />
                </Field>
                {cards ? (
                  <Field label="Background colour">
                    <div className="flex gap-2">
                      <input
                        type="color"
                        aria-label="Background colour"
                        value={it.bgColor || '#2c5f7d'}
                        onChange={(e) => patch(idx, { bgColor: e.target.value })}
                        className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
                      />
                      <Input value={it.bgColor || ''} onChange={(e) => patch(idx, { bgColor: e.target.value })} className="font-mono" />
                    </div>
                  </Field>
                ) : (
                  <Field label="Subtitle">
                    <Input value={it.subtitle || ''} onChange={(e) => patch(idx, { subtitle: e.target.value })} />
                  </Field>
                )}
                <Field label="Link" className="sm:col-span-2">
                  <Input value={it.link || ''} placeholder="/products" onChange={(e) => patch(idx, { link: e.target.value })} />
                </Field>
              </div>
              <div className="flex gap-1 md:flex-col">
                <IconButton label="Move up" disabled={idx === 0} onClick={() => move(idx, -1)}>
                  <ArrowUp className="size-4" />
                </IconButton>
                <IconButton label="Move down" disabled={idx === items.length - 1} onClick={() => move(idx, 1)}>
                  <ArrowDown className="size-4" />
                </IconButton>
                <IconButton
                  label="Remove"
                  danger
                  onClick={() => window.confirm(`Remove this ${noun}?`) && update(items.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      )}
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onSave={() =>
          save.mutate(
            { [bodyKey]: items },
            {
              onSuccess: () => {
                setDirty(false);
                toast.success(`${title} saved`);
              },
            },
          )
        }
      />
    </Section>
  );
}

function ImageSlot({ label, src, bg, optional, onUploaded, onClear }) {
  return (
    <div className="w-32 space-y-1.5">
      <div
        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
        style={bg ? { background: bg } : undefined}
      >
        {src ? <img src={src} alt="" className="size-full object-cover" /> : <ImageIcon className="size-5 text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        {label}
        {optional && !src && ' (optional)'}
      </p>
      <div className="flex gap-1">
        <UploadButton size="sm" variant="outline" onUploaded={onUploaded}>
          {src ? 'Replace' : 'Upload'}
        </UploadButton>
        {optional && src && (
          <IconButton label={`Remove ${label.toLowerCase()} image`} danger onClick={onClear}>
            <X className="size-4" />
          </IconButton>
        )}
      </div>
    </div>
  );
}

function SaveBar({ dirty, saving, onSave, label = 'Save changes' }) {
  return (
    <div className="mt-4 flex items-center justify-end gap-3">
      {dirty && <span className="text-xs font-medium text-amber-600">Unsaved changes</span>}
      <Button type="button" onClick={onSave} disabled={!dirty || saving}>
        {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}

function AnnouncementEditor({ initial }) {
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState('');
  const save = useSaveSetting('announcements', (body) => body.items);
  const persist = (next, message) =>
    save.mutate({ items: next }, { onSuccess: () => { setItems(next); toast.success(message); } });
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    persist([...items, text], 'Announcement added');
    setDraft('');
  };
  return (
    <Section
      title="Announcement bar"
      description="Short messages that rotate in the bar at the very top of the storefront — up to 10."
    >
      {items.length > 0 && (
        <ul className="mb-3 space-y-2">
          {items.map((text, idx) => (
            <li key={idx} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
              <span>{text}</span>
              <IconButton
                label="Remove"
                danger
                disabled={save.isPending}
                onClick={() => persist(items.filter((_, i) => i !== idx), 'Announcement removed')}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {items.length < 10 ? (
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder="e.g. Free delivery on orders over 200 QAR"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" onClick={add} disabled={!draft.trim() || save.isPending}>
            <Plus className="mr-2 size-4" /> Add
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">That is the maximum of 10 — remove one to add another.</p>
      )}
    </Section>
  );
}

function HeroSealEditor({ initial }) {
  const [seal, setSeal] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const save = useSaveSetting('hero-seal', (body) => body);
  const set = (patch) => {
    setSeal((s) => ({ ...s, ...patch }));
    setDirty(true);
  };
  return (
    <Section title="Hero seal" description="The round badge over the home page's top banner.">
      <div className="space-y-4">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={seal.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          Show the seal on the hero banner
        </label>
        <Field label="Seal text" hint="Up to 60 characters.">
          <Input
            value={seal.text}
            maxLength={60}
            placeholder="Timeless · Elegance"
            disabled={!seal.enabled}
            onChange={(e) => set({ text: e.target.value })}
          />
        </Field>
      </div>
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate(seal, { onSuccess: () => { setDirty(false); toast.success('Hero seal saved'); } })}
      />
    </Section>
  );
}

function BankDetailsEditor({ initial }) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const save = useSaveSetting('b2b-bank-details', (body) => body);
  return (
    <Section
      title="B2B bank details"
      description="Included in quote emails when a wholesale customer pays by bank transfer."
    >
      <Textarea
        rows={8}
        value={value}
        placeholder={'Bank name\nAccount name\nIBAN\nSWIFT'}
        onChange={(e) => {
          setValue(e.target.value);
          setDirty(true);
        }}
      />
      <SaveBar
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate({ value }, { onSuccess: () => { setDirty(false); toast.success('Bank details saved'); } })}
      />
    </Section>
  );
}
