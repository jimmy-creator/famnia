import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Switch } from '@/hub/ui/switch';
import { Textarea } from '@/hub/ui/textarea';
import { uploadProductImage } from '@/hub/lib/api';
import { categoriesQuery } from '@/hub/lib/apiProducts';
import { cn } from '@/lib/utils';

import { I18N } from '@/hub/lib/storefront';

/**
 * Categories from Catalogue → Categories: several may be ticked, the starred
 * one is the main category (shown on the product and used by POS, coupons,
 * reports). `value` is the ordered list of names, main first.
 */
export function CategoryPicker({ value, onChange, disabled }) {
  const categories = useQuery(categoriesQuery);
  const list = (categories.data ?? []).filter((c) => c.active || value.includes(c.name));
  const toggle = (name) => {
    if (value.includes(name)) onChange(value.filter((n) => n !== name));
    else onChange([...value, name]);
  };
  const makeMain = (name) => onChange([name, ...value.filter((n) => n !== name)]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => {
          const on = value.includes(c.name);
          const main = value[0] === c.name;
          return (
            <span
              key={c.id}
              className={cn(
                'inline-flex items-center overflow-hidden rounded-full border text-sm',
                on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground/80',
              )}
            >
              <button type="button" disabled={disabled} className="px-3 py-1.5" onClick={() => toggle(c.name)}>
                {c.name}
              </button>
              {on && (
                <button
                  type="button"
                  disabled={disabled || main}
                  title={main ? 'Main category' : 'Make this the main category'}
                  className="pr-2.5"
                  onClick={() => makeMain(c.name)}
                >
                  <Star className={cn('size-3.5', main ? 'fill-current' : 'opacity-50')} />
                </button>
              )}
            </span>
          );
        })}
      </div>
      {categories.isSuccess && !list.length && (
        <p className="text-xs text-muted-foreground">
          No categories yet — add them in{' '}
          <Link to="/hub/m/categories" className="underline">
            Catalogue → Categories
          </Link>
          .
        </p>
      )}
      {!value.length && <p className="text-xs text-destructive">Select at least one category.</p>}
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Main: <span className="font-medium text-foreground">{value[0]}</span> — click ★ to change. New categories are
          added in{' '}
          <Link to="/hub/m/categories" className="underline">
            Catalogue → Categories
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** Product gallery: upload several, reorder (first = main), remove. */
export function GalleryEditor({ value, onChange, disabled }) {
  const input = useRef(null);
  const [uploading, setUploading] = useState(0);
  const add = async (files) => {
    const picked = [...(files ?? [])];
    const tooBig = picked.filter((f) => f.size > 5 * 1024 * 1024);
    if (tooBig.length) toast.error('Images must be 5 MB or smaller.');
    const ok = picked.filter((f) => f.size <= 5 * 1024 * 1024);
    if (!ok.length) return;
    setUploading((n) => n + ok.length);
    const urls = [];
    for (const file of ok) {
      try {
        urls.push(await uploadProductImage(file));
      } catch (err) {
        toast.error(err.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (urls.length) onChange([...value, ...urls]);
  };
  const move = (i, dir) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="relative w-24">
            <img src={url} alt="" className="size-24 rounded-xl border border-border object-cover" />
            {i === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                Main
              </span>
            )}
            {!disabled && (
              <div className="mt-1 flex items-center justify-between">
                <button type="button" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Remove image"
                  className="text-destructive"
                  onClick={() => onChange(value.filter((_, k) => k !== i))}
                >
                  <X className="size-4" />
                </button>
                <button type="button" aria-label="Move right" disabled={i === value.length - 1} onClick={() => move(i, 1)}>
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {uploading ? 'Uploading…' : 'Add images'}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
      />
      <p className="text-xs text-muted-foreground">
        The first image is the main one on the storefront. Images are converted to WebP on upload.
      </p>
    </div>
  );
}

/** Compare-at price, featured, VAT, HSN, hide online, reorder qty, Arabic. */
export function StorefrontFields({ value, onChange, canEditPrice = true }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Compare-at price (QAR)">
          <Input
            type="number"
            min={0}
            step="0.01"
            value={value.comparePrice}
            onChange={(e) => set('comparePrice', e.target.value)}
            disabled={!canEditPrice}
            placeholder="Was price"
            className="h-11"
          />
        </Field>
        <Field label="HSN code">
          <Input value={value.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} className="h-11" />
        </Field>
        <Field label="VAT rate (%)">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={value.taxRate}
            onChange={(e) => set('taxRate', e.target.value)}
            disabled={!value.taxable}
            className="h-11"
          />
        </Field>
        <Field label="Reorder quantity">
          <Input
            type="number"
            min={0}
            value={value.reorderQty}
            onChange={(e) => set('reorderQty', e.target.value)}
            placeholder="Units to order"
            className="h-11"
          />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Toggle label="Featured" hint="Shown in featured spots on the storefront." checked={value.featured} onChange={(v) => set('featured', v)} />
        <Toggle label="VAT taxable" hint="Charge VAT at the rate above." checked={value.taxable} onChange={(v) => set('taxable', v)} />
        <Toggle label="Hide online" hint="POS only — hidden from the website." checked={value.hideOnline} onChange={(v) => set('hideOnline', v)} />
      </div>
      {I18N && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Arabic name">
            <Input dir="rtl" value={value.nameAr} onChange={(e) => set('nameAr', e.target.value)} className="h-11" />
          </Field>
          <Field label="Arabic description">
            <Textarea dir="rtl" rows={2} value={value.descriptionAr} onChange={(e) => set('descriptionAr', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
