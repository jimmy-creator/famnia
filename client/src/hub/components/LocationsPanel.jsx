import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmAction } from '@/hub/components/ConfirmAction';
import { EmptyState, ErrorState, LoadingRows } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Switch } from '@/hub/ui/switch';
import { accessQuery } from '@/hub/lib/api';
import {
  canManageInventory,
  createLocation,
  deleteLocation,
  ik,
  locationsQuery,
  setOnlineDefaultLocation,
  updateLocation,
} from '@/hub/lib/apiInventoryOps';

const SELECT_CLS = 'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm';
const TYPES = { store: 'Store / branch', warehouse: 'Warehouse' };

/**
 * Branches and warehouses that hold stock. The "online default" is the
 * location website orders take stock from.
 */
export function LocationsPanel() {
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const canEdit = canManageInventory(access);
  const q = useQuery(locationsQuery);
  const [editing, setEditing] = useState(null); // location | 'new'
  const [removing, setRemoving] = useState(null);

  const refresh = () => client.invalidateQueries({ queryKey: ik.locations });

  const makeDefault = useMutation({
    mutationFn: (loc) => setOnlineDefaultLocation(loc.id),
    onSuccess: async (_, loc) => {
      toast.success(`${loc.name} now supplies online orders`);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (loc) => deleteLocation(loc.id),
    onSuccess: async () => {
      toast.success('Location deleted');
      setRemoving(null);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Branches and warehouses that hold stock. Website orders take stock from the online default.
          </p>
        </div>
        {canEdit && (
          <Button className="h-10" onClick={() => setEditing('new')}>
            <Plus className="mr-2 size-4" /> Add location
          </Button>
        )}
      </div>

      {q.isPending ? (
        <LoadingRows count={3} />
      ) : q.isError ? (
        <ErrorState section="Locations" message={q.error.message} onRetry={() => q.refetch()} />
      ) : !rows.length ? (
        <EmptyState title="No locations yet" hint="Add your shop or warehouse to start tracking stock per location." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((l) => (
            <li key={l.id} className="card-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                    <MapPin className="size-4 text-muted-foreground" />
                    {l.name}
                    <span className="text-xs font-normal text-muted-foreground">{l.code}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TYPES[l.type] ?? l.type}
                    {l.phone ? ` · ${l.phone}` : ''}
                    {l.address ? ` · ${l.address}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.isOnlineDefault && (
                      <span className="tint-lavender inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-[var(--tint-lavender-ink)]">
                        <Globe className="size-3" /> Online default
                      </span>
                    )}
                    {l.active === false && (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${l.name}`} onClick={() => setEditing(l)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${l.name}`} onClick={() => setRemoving(l)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              {canEdit && !l.isOnlineDefault && l.active !== false && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-9"
                  disabled={makeDefault.isPending}
                  onClick={() => makeDefault.mutate(l)}
                >
                  Use for online orders
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <LocationDialog location={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <ConfirmAction
        open={Boolean(removing)}
        title={`Delete ${removing?.name ?? 'location'}?`}
        description={
          <p>
            Only possible when it holds no stock and no orders reference it. Otherwise move its stock out, or edit it and switch it
            to inactive.
          </p>
        }
        confirmLabel="Delete"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

function LocationDialog({ location, onClose, onSaved }) {
  return (
    <Dialog open={Boolean(location)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>{location === 'new' ? 'Add location' : `Edit ${location?.name ?? ''}`}</DialogTitle>
        </DialogHeader>
        {location && (
          <LocationForm key={location === 'new' ? 'new' : location.id} location={location} onClose={onClose} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LocationForm({ location, onClose, onSaved }) {
  const isNew = location === 'new';
  const init = isNew ? {} : location;
  const [form, setForm] = useState({
    name: init.name ?? '',
    code: init.code ?? '',
    type: init.type ?? 'store',
    sortOrder: String(init.sortOrder ?? 0),
    address: init.address ?? '',
    phone: init.phone ?? '',
    isOnlineDefault: Boolean(init.isOnlineDefault),
    active: init.active !== false,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase() || null,
        type: form.type,
        sortOrder: Number(form.sortOrder) || 0,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        isOnlineDefault: form.isOnlineDefault,
      };
      return isNew ? createLocation(body) : updateLocation(location.id, { ...body, active: form.active });
    },
    onSuccess: async () => {
      toast.success(isNew ? 'Location added' : 'Location saved');
      await onSaved();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const invalid = !form.name.trim();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={set('name')} className="h-11" placeholder="e.g. Doha Mall" required />
        </Field>
        <Field label="Short code (optional)">
          <Input value={form.code} onChange={set('code')} className="h-11 uppercase" maxLength={20} placeholder="e.g. DOHA" />
        </Field>
        <Field label="Type">
          <select value={form.type} onChange={set('type')} className={SELECT_CLS}>
            {Object.entries(TYPES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort order">
          <Input type="number" value={form.sortOrder} onChange={set('sortOrder')} className="h-11" />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={set('phone')} className="h-11" />
        </Field>
        <Field label="Address">
          <Input value={form.address} onChange={set('address')} className="h-11" />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3 text-sm">
        <span>
          <span className="block font-medium text-foreground">Online default</span>
          <span className="text-xs text-muted-foreground">
            Website orders take stock from here.{!isNew && init.isOnlineDefault ? ' To change it, make another location the default.' : ''}
          </span>
        </span>
        <Switch
          checked={form.isOnlineDefault}
          disabled={!isNew && init.isOnlineDefault}
          onCheckedChange={set('isOnlineDefault')}
        />
      </label>
      {!isNew && (
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3 text-sm">
          <span>
            <span className="block font-medium text-foreground">Active</span>
            <span className="text-xs text-muted-foreground">Inactive locations are hidden from stock screens and the till.</span>
          </span>
          <Switch checked={form.active} onCheckedChange={set('active')} />
        </label>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-11" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="h-11" disabled={invalid || save.isPending}>
          {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isNew ? 'Add location' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
