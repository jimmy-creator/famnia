/**
 * Business settings — Admin only.
 *
 * Every value here is a default for FUTURE orders, products and documents.
 * Saving never touches a confirmed order, a historical invoice or the stock
 * ledger; the server (PUT /api/hub/settings) also requires admin.settings.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, RotateCcw, Save, ShieldOff, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FemniaLogo } from '@/hub/components/Brand';
import { LocationsPanel } from '@/hub/components/LocationsPanel';
import { CatalogueReplaceCard } from '@/hub/components/CatalogueReplaceCard';
import { FundingAccountsCard } from '@/hub/components/FundingAccountsCard';
import { DatabaseBackupCard } from '@/hub/components/DatabaseBackupCard';
import { ErrorState, Loading, PageHeader } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/hub/ui/card';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/hub/ui/tabs';
import { Textarea } from '@/hub/ui/textarea';
import {
  accessQuery,
  appSettingsQuery,
  deliveryPaymentModesQuery,
  qk,
  saveAppSettings,
  saveDeliveryPaymentModes,
} from '@/hub/lib/api';
import { exportFullBackup } from '@/hub/lib/backup';
import { can } from '@/hub/lib/permissions';
import { SALES_ORDER_STATUSES } from '@/hub/lib/sales';
import { dedupeList, listDuplicate, validateSettings } from '@/hub/lib/settings';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const SECTIONS = [
  { key: 'business', label: 'Business' },
  { key: 'orders', label: 'Orders' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'printing', label: 'Printing' },
  { key: 'lists', label: 'Lists' },
  { key: 'locations', label: 'Locations' },
  { key: 'backup', label: 'Backup' },
];

const NEW_ORDER_STATUSES = SALES_ORDER_STATUSES.filter((s) => s === 'Draft' || s === 'Confirmed');

// Delivery payment modes have their own editor and save button, so the main
// form never sends (or compares) them.
const withoutModes = (settings) => {
  const rest = { ...settings };
  delete rest.deliveryPaymentModes;
  return rest;
};

function Field({ id, label, hint, error, children }) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Chip editor with a case-insensitive duplicate guard. */
function ListEditor({ id, label, hint, items, error, onChange }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (listDuplicate(items, value)) {
      toast.error(`"${value}" is already in ${label.toLowerCase()}.`);
      return;
    }
    onChange([...items, value]);
    setDraft('');
  };
  return (
    <div className="min-w-0 rounded-xl border border-border/70 p-3">
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="rounded-full p-0.5 hover:bg-background"
              onClick={() => onChange(items.filter((i) => i !== item))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {!items.length && <span className="text-xs text-muted-foreground">No entries yet.</span>}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add an entry"
          className="h-11"
        />
        <Button type="button" variant="secondary" className="h-11 shrink-0" onClick={add}>
          <Plus className="mr-1 size-4" /> Add
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function SettingsPage() {
  useHubTitle('Settings — FEMNIA Hub');
  const access = useQuery(accessQuery);
  const settings = useQuery(appSettingsQuery);
  // Kept above the form so a save or refresh (which remounts it) keeps them.
  // ?tab= opens a section directly (e.g. /hub/settings?tab=locations).
  const [section, setSection] = useState(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab');
    return SECTIONS.some((x) => x.key === wanted) ? wanted : 'business';
  });
  const backup = useMutation({
    mutationFn: exportFullBackup,
    onSuccess: (result) => toast.success(`Backup downloaded — ${result.filename}`),
    onError: (e) => toast.error(e.message || 'Could not create the backup.'),
  });

  const allowed = access.data ? can(access.data, 'admin.settings') : true;

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" subtitle="Business defaults for future orders and documents." />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ShieldOff className="size-8 text-muted-foreground" />
            <p className="font-medium">Admin access required</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Business settings can only be changed by an Admin. Ask an Admin to update these defaults for you.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (settings.error)
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" subtitle="Business defaults for future orders and documents." />
        <ErrorState
          section="Settings"
          message={settings.error instanceof Error ? settings.error.message : 'Could not load settings.'}
          onRetry={() => {
            void settings.refetch();
          }}
        />
      </div>
    );

  if (!settings.data) return <Loading label="Loading settings…" />;

  // Remounts with the freshly loaded values whenever the settings reload.
  return (
    <SettingsForm
      key={settings.dataUpdatedAt}
      saved={settings.data}
      isAdmin={Boolean(access.data?.isAdmin)}
      onRefresh={() => void settings.refetch()}
      section={section}
      setSection={setSection}
      backup={backup}
    />
  );
}

function SettingsForm({ saved, isAdmin, onRefresh, section, setSection, backup }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(saved);

  const errors = useMemo(() => validateSettings(form), [form]);
  const dirty = useMemo(
    () => JSON.stringify(withoutModes(form)) !== JSON.stringify(withoutModes(saved)),
    [form, saved],
  );

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: async () =>
      saveAppSettings({
        ...withoutModes(form),
        categories: dedupeList(form.categories),
        sizes: dedupeList(form.sizes),
        colours: dedupeList(form.colours),
        paymentMethods: dedupeList(form.paymentMethods),
        paymentHolders: dedupeList(form.paymentHolders),
      }),
    onSuccess: async (result) => {
      toast.success(
        result.changed
          ? `Saved — ${result.changed} setting${result.changed > 1 ? 's' : ''} updated. Future orders and documents use the new defaults.`
          : 'Nothing to save.',
      );
      await queryClient.invalidateQueries({ queryKey: qk.appSettings });
      await queryClient.invalidateQueries({ queryKey: qk.activity });
      await queryClient.invalidateQueries({ queryKey: qk.products });
    },
    onError: (e) => toast.error(e.message),
  });

  const err = (key) => errors[key];
  const invalid = Object.keys(errors).length > 0;

  return (
    <div className="space-y-6 pb-28">
      <PageHeader
        title="Settings"
        subtitle="Admin defaults for future orders, products and documents. Existing invoices, confirmed orders and stock are never changed."
        actions={
          <Button variant="outline" onClick={onRefresh} className="h-11">
            <RotateCcw className="mr-2 size-4" /> Refresh
          </Button>
        }
      />

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.key} value={s.key} className="min-h-10">
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {section === 'business' && (
        <Card>
          <CardHeader>
            <CardTitle>Business</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="s-name" label="Business name" error={err('businessName')}>
              <Input
                id="s-name"
                className="h-11"
                value={form.businessName}
                onChange={(e) => set('businessName', e.target.value)}
              />
            </Field>
            <Field id="s-currency" label="Currency" hint="Code shown on invoices and labels." error={err('currency')}>
              <Input
                id="s-currency"
                className="h-11"
                value={form.currency}
                onChange={(e) => set('currency', e.target.value.toUpperCase())}
              />
            </Field>
            <Field id="s-location" label="Location" error={err('location')}>
              <Input
                id="s-location"
                className="h-11"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
              />
            </Field>
            <Field id="s-phone" label="Phone" error={err('phone')}>
              <Input id="s-phone" className="h-11" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                id="s-logo"
                label="Logo"
                hint="Leave empty to keep the built-in FEMNIA logo. An https:// image address replaces it on screen."
                error={err('logoUrl')}
              >
                <div className="flex items-center gap-3">
                  {form.logoUrl.trim() ? (
                    <img
                      src={form.logoUrl.trim()}
                      alt="Business logo"
                      className="size-12 rounded-xl border border-border object-contain"
                    />
                  ) : (
                    <FemniaLogo className="size-12" />
                  )}
                  <Input
                    id="s-logo"
                    className="h-11"
                    placeholder="https://…"
                    value={form.logoUrl}
                    onChange={(e) => set('logoUrl', e.target.value)}
                  />
                </div>
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {section === 'business' && isAdmin && <FundingAccountsCard />}

      {section === 'orders' && (
        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="s-prefix"
              label="Order / invoice prefix"
              hint="Used for new order numbers only — existing numbers stay as they are."
              error={err('invoicePrefix')}
            >
              <Input
                id="s-prefix"
                className="h-11"
                value={form.invoicePrefix}
                onChange={(e) => set('invoicePrefix', e.target.value.toUpperCase())}
              />
            </Field>
            <Field id="s-cust-prefix" label="Customer prefix" hint="Used for new customer codes." error={err('customerPrefix')}>
              <Input
                id="s-cust-prefix"
                className="h-11"
                value={form.customerPrefix}
                onChange={(e) => set('customerPrefix', e.target.value.toUpperCase())}
              />
            </Field>
            <Field
              id="s-status"
              label="Default order status"
              hint="Status a brand-new order starts in. Stock still moves only on confirmation."
              error={err('defaultOrderStatus')}
            >
              <Select value={form.defaultOrderStatus} onValueChange={(v) => set('defaultOrderStatus', v)}>
                <SelectTrigger id="s-status" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  {NEW_ORDER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      )}

      {section === 'delivery' && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="s-charge"
              label={`Default delivery charge (${form.currency})`}
              hint="Pre-filled on new delivery orders and still editable per order."
              error={err('defaultDeliveryCharge')}
            >
              <Input
                id="s-charge"
                type="number"
                min="0"
                step="0.5"
                inputMode="decimal"
                className="h-11"
                value={String(form.defaultDeliveryCharge)}
                onChange={(e) => set('defaultDeliveryCharge', Number(e.target.value))}
              />
            </Field>
            <Field id="s-label-size" label="Default label size">
              <Select value={form.labelSize} onValueChange={(v) => set('labelSize', v)}>
                <SelectTrigger id="s-label-size" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  <SelectItem value="100x130">100 × 130 mm</SelectItem>
                  <SelectItem value="100x150">100 × 150 mm</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <DeliveryPaymentModesEditor />
            </div>
            <div className="sm:col-span-2">
              <ListEditor
                id="s-couriers"
                label="Courier / driver names"
                hint="Suggested on delivery orders; staff may still type a different name."
                items={form.courierNames}
                error={err('courierNames')}
                onChange={(v) => set('courierNames', v)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {section === 'inventory' && (
        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="s-reorder"
              label="Default reorder level"
              hint="Pre-filled when a new product is created."
              error={err('defaultReorderLevel')}
            >
              <Input
                id="s-reorder"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                className="h-11"
                value={String(form.defaultReorderLevel)}
                onChange={(e) => set('defaultReorderLevel', Number(e.target.value))}
              />
            </Field>
            <Field
              id="s-lowstock"
              label="Stock warning threshold"
              hint="Units at or below this count are flagged Low Stock when a product has no reorder level."
              error={err('lowStockRule')}
            >
              <Input
                id="s-lowstock"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                className="h-11"
                value={String(form.lowStockRule)}
                onChange={(e) => set('lowStockRule', Number(e.target.value))}
              />
            </Field>
            <Field
              id="s-multiplier"
              label="Reorder multiplier"
              hint="Suggested reorder quantity = reorder level × this number."
              error={err('reorderMultiplier')}
            >
              <Input
                id="s-multiplier"
                type="number"
                min="1"
                step="0.5"
                inputMode="decimal"
                className="h-11"
                value={String(form.reorderMultiplier)}
                onChange={(e) => set('reorderMultiplier', Number(e.target.value))}
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {section === 'printing' && (
        <Card>
          <CardHeader>
            <CardTitle>Printing</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field id="s-print-size" label="Default delivery label size">
              <Select value={form.labelSize} onValueChange={(v) => set('labelSize', v)}>
                <SelectTrigger id="s-print-size" className="h-11 sm:max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  <SelectItem value="100x130">100 × 130 mm</SelectItem>
                  <SelectItem value="100x150">100 × 150 mm</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="s-invoice-footer"
              label="Invoice footer"
              hint="Appears on newly printed A4 invoices."
              error={err('invoiceFooter')}
            >
              <Textarea
                id="s-invoice-footer"
                rows={2}
                value={form.invoiceFooter}
                onChange={(e) => set('invoiceFooter', e.target.value)}
              />
            </Field>
            <Field
              id="s-label-footer"
              label="Label footer"
              hint="Printed at the bottom of new delivery labels."
              error={err('labelFooter')}
            >
              <Textarea
                id="s-label-footer"
                rows={2}
                value={form.labelFooter}
                onChange={(e) => set('labelFooter', e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>
      )}

      {section === 'backup' && (
        <Card>
          <CardHeader>
            <CardTitle>Backup Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Downloads one Excel file with a separate sheet for Products, Inventory, Stock In, Stock Out, Stock
              Adjustments, Orders, Order Items, Returns, Customers, Payments, Expenses, Assets, Liabilities, Reimbursements, Suppliers,
              Purchase Orders, Cash Accounts and Transactions, Capital, Coupons, Reviews, Categories, Locations, Shifts, Till Returns,
              Stock Transfers and Audit Logs. This
              only reads your records — nothing is changed, deleted or recalculated.
            </p>
            {isAdmin ? (
              <>
                <Button className="h-11" disabled={backup.isPending} onClick={() => backup.mutate()}>
                  <Download className="mr-2 size-4" /> {backup.isPending ? 'Preparing backup…' : 'Backup Data'}
                </Button>
                {backup.data && (
                  <div className="rounded-xl border border-border p-3 text-sm">
                    <p className="font-medium">{backup.data.filename}</p>
                    <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
                      {backup.data.counts.map((c) => (
                        <li key={c.sheet}>
                          {c.sheet}: {c.rows} row{c.rows === 1 ? '' : 's'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Only an Admin can download a full data backup.</p>
            )}
          </CardContent>
        </Card>
      )}

      {section === 'locations' && <LocationsPanel />}

      {section === 'backup' && isAdmin && <DatabaseBackupCard />}
      {section === 'backup' && isAdmin && <CatalogueReplaceCard backupFilename={backup.data?.filename ?? null} />}

      {section === 'lists' && (
        <Card>
          <CardHeader>
            <CardTitle>Lists</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <ListEditor
              id="s-categories"
              label="Categories"
              items={form.categories}
              error={err('categories')}
              onChange={(v) => set('categories', v)}
            />
            <ListEditor id="s-sizes" label="Sizes" items={form.sizes} error={err('sizes')} onChange={(v) => set('sizes', v)} />
            <ListEditor
              id="s-colours"
              label="Colours"
              items={form.colours}
              error={err('colours')}
              onChange={(v) => set('colours', v)}
            />
            <ListEditor
              id="s-methods"
              label="Payment methods"
              items={form.paymentMethods}
              error={err('paymentMethods')}
              onChange={(v) => set('paymentMethods', v)}
            />
            <div className="sm:col-span-2">
              <ListEditor
                id="s-holders"
                label="Payment holder options"
                hint="Where money is physically held when a payment is recorded."
                items={form.paymentHolders}
                error={err('paymentHolders')}
                onChange={(v) => set('paymentHolders', v)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {invalid
              ? 'Fix the highlighted values before saving.'
              : dirty
                ? 'Unsaved changes — they apply to future records only.'
                : 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" disabled={!dirty || save.isPending} onClick={() => setForm(saved)}>
              Cancel
            </Button>
            <Button className="h-11" disabled={!dirty || invalid || save.isPending} onClick={() => save.mutate()}>
              <Save className="mr-2 size-4" /> {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Payment modes offered to delivery staff when they collect money. Saved on
 * its own; only an Admin can write it.
 */
function DeliveryPaymentModesEditor() {
  const client = useQueryClient();
  const modes = useQuery(deliveryPaymentModesQuery);
  const [items, setItems] = useState(null);
  const list = items ?? modes.data ?? [];

  const save = useMutation({
    mutationFn: () => saveDeliveryPaymentModes(list),
    onSuccess: async () => {
      toast.success('Delivery payment modes saved.');
      setItems(null);
      await client.invalidateQueries({ queryKey: qk.deliveryPaymentModes });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save the payment modes.'),
  });

  return (
    <div className="space-y-3">
      <ListEditor
        id="s-delivery-modes"
        label="Delivery payment modes"
        hint="Shown to delivery staff when they record a collected payment."
        items={list}
        onChange={setItems}
      />
      <Button type="button" variant="outline" className="h-10" disabled={!items || save.isPending} onClick={() => save.mutate()}>
        Save payment modes
      </Button>
    </div>
  );
}
