import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { createProductVariants, nextProductCodes, suppliersQuery } from '@/hub/lib/api';
import { suggestSku } from '@/hub/lib/format';
import { invalidateStock } from '@/hub/lib/invalidate';

const emptyVariant = () => ({
  sku: '',
  productCode: '',
  size: '',
  color: '',
  costPrice: 0,
  sellingPrice: 0,
  openingStock: 0,
  rack: '',
  shelfLocation: '',
});

const emptyForm = () => ({
  name: '',
  category: '',
  designModel: '',
  brand: 'FEMNIA',
  description: '',
  rack: '',
  shelfLocation: '',
  supplier: '',
  reorderLevel: 3,
  notes: '',
  isActive: true,
  imageUrl: '',
  batchNumber: '',
  sourceCountry: '',
  wholesaler: '',
});

/** `onSaved(keys, stockIn)` — stockIn = the user asked to continue straight into Stock In. */
export function ProductCreateDialog({ open, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const suppliers = useQuery({ ...suppliersQuery, enabled: open });
  const [form, setForm] = useState(emptyForm);
  const [variants, setVariants] = useState([emptyVariant()]);
  const [saving, setSaving] = useState(false);

  // Suggest the next free Product Codes whenever the dialog opens or a variant is added.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const missing = variants.filter((v) => !v.productCode.trim()).length;
    if (!missing) return undefined;
    const taken = new Set(variants.map((v) => v.productCode).filter(Boolean));
    nextProductCodes(missing + taken.size)
      .then((codes) => {
        if (cancelled) return;
        const free = codes.filter((c) => !taken.has(c));
        let next = 0;
        setVariants((prev) => prev.map((v) => (v.productCode.trim() ? v : { ...v, productCode: free[next++] ?? '' })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, variants]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setVariant = (index, patch) => setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));

  const reset = () => {
    setForm(emptyForm());
    setVariants([emptyVariant()]);
  };

  const save = async (thenStockIn) => {
    setSaving(true);
    try {
      const result = await createProductVariants({ ...form, imageUrl: form.imageUrl.trim() || null, variants });
      await invalidateStock(queryClient);
      toast.success(`Product saved — ${result.skus.length} SKU variant(s) created.`);
      reset();
      onSaved?.(result.keys, thenStockIn);
      onClose();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Product details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Product Name *">
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} className="h-11" />
              </Field>
              <Field label="Category *">
                <Input value={form.category} onChange={(e) => set('category', e.target.value)} className="h-11" />
              </Field>
              <Field label="Design / Model">
                <Input value={form.designModel} onChange={(e) => set('designModel', e.target.value)} className="h-11" />
              </Field>
              <Field label="Brand">
                <Input value={form.brand} onChange={(e) => set('brand', e.target.value)} className="h-11" />
              </Field>
              <Field label="Default Supplier">
                <Input
                  value={form.supplier}
                  onChange={(e) => set('supplier', e.target.value)}
                  placeholder="Leave empty — Not Assigned"
                  className="h-11"
                />
              </Field>
              <Field label="Reorder Level">
                <Input
                  type="number"
                  min={0}
                  value={form.reorderLevel}
                  onChange={(e) => set('reorderLevel', Math.max(0, Number(e.target.value) || 0))}
                  className="h-11"
                />
              </Field>
              <Field label="Rack">
                <Input value={form.rack} onChange={(e) => set('rack', e.target.value)} className="h-11" />
              </Field>
              <Field label="Shelf Location">
                <Input value={form.shelfLocation} onChange={(e) => set('shelfLocation', e.target.value)} className="h-11" />
              </Field>
              <Field label="Product Image URL (optional)">
                <Input
                  value={form.imageUrl}
                  onChange={(e) => set('imageUrl', e.target.value)}
                  placeholder="https://…"
                  className="h-11"
                />
              </Field>
              <Field label="Active">
                <select
                  value={form.isActive ? 'yes' : 'no'}
                  onChange={(e) => set('isActive', e.target.value === 'yes')}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="yes">Active</option>
                  <option value="no">Inactive</option>
                </select>
              </Field>
            </div>
            <Field label="Product Description">
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
            </Field>
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
            </Field>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Batch details (optional)</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Batch Number">
                <Input
                  value={form.batchNumber}
                  onChange={(e) => set('batchNumber', e.target.value)}
                  placeholder="Batch 1"
                  className="h-11"
                />
              </Field>
              <Field label="Source Country">
                <Input
                  value={form.sourceCountry}
                  onChange={(e) => set('sourceCountry', e.target.value)}
                  placeholder="UAE"
                  className="h-11"
                />
              </Field>
              <Field label="Wholesaler">
                <Input
                  list="femnia-create-supplier-list"
                  value={form.wholesaler}
                  onChange={(e) => set('wholesaler', e.target.value)}
                  placeholder="Pick or type a supplier"
                  className="h-11"
                />
              </Field>
            </div>
            <datalist id="femnia-create-supplier-list">
              {(suppliers.data ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              These details describe the opening-stock shipment only. Later arrivals record their own batch in Stock In, so
              one SKU can hold several batches such as “Batch 1 UAE” and “Batch 2 CHN”.
            </p>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Variants — every size / colour combination gets its own SKU
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10"
                onClick={() => setVariants((prev) => [...prev, emptyVariant()])}
              >
                <Plus className="mr-1 size-4" /> Add Variant
              </Button>
            </div>

            {variants.map((variant, index) => (
              <div key={index} className="rounded-2xl border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Variant {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() =>
                        setVariant(index, { sku: suggestSku(form.name, form.category, variant.size, variant.color, index) })
                      }
                    >
                      <Wand2 className="mr-1 size-4" /> Generate SKU
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => setVariants((prev) => [...prev, { ...variant, sku: '', productCode: '' }])}
                    >
                      <Copy className="mr-1 size-4" /> Duplicate
                    </Button>
                    {variants.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 text-destructive"
                        onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Product Code *">
                    <Input
                      value={variant.productCode}
                      onChange={(e) => setVariant(index, { productCode: e.target.value.replace(/\D/g, '') })}
                      onBlur={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        if (digits) setVariant(index, { productCode: digits.padStart(4, '0') });
                      }}
                      inputMode="numeric"
                      placeholder="0001"
                      className="h-11 font-mono"
                    />
                  </Field>
                  <Field label="SKU Code *">
                    <Input
                      value={variant.sku}
                      onChange={(e) => setVariant(index, { sku: e.target.value.toUpperCase() })}
                      placeholder="Enter SKU manually or generate"
                      className="h-11 font-mono"
                    />
                  </Field>
                  <Field label="Size / Age">
                    <Input value={variant.size} onChange={(e) => setVariant(index, { size: e.target.value })} className="h-11" />
                  </Field>
                  <Field label="Colour / Variant">
                    <Input value={variant.color} onChange={(e) => setVariant(index, { color: e.target.value })} className="h-11" />
                  </Field>
                  <Field label="Opening Stock">
                    <Input
                      type="number"
                      min={0}
                      value={variant.openingStock}
                      onChange={(e) => setVariant(index, { openingStock: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-11"
                    />
                  </Field>
                  <Field label="Cost Price (QAR)">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={variant.costPrice}
                      onChange={(e) => setVariant(index, { costPrice: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-11"
                    />
                  </Field>
                  <Field label="Selling Price (QAR)">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={variant.sellingPrice}
                      onChange={(e) => setVariant(index, { sellingPrice: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-11"
                    />
                  </Field>
                  <Field label="Rack override">
                    <Input value={variant.rack} onChange={(e) => setVariant(index, { rack: e.target.value })} className="h-11" />
                  </Field>
                  <Field label="Shelf override">
                    <Input
                      value={variant.shelfLocation}
                      onChange={(e) => setVariant(index, { shelfLocation: e.target.value })}
                      className="h-11"
                    />
                  </Field>
                </div>
              </div>
            ))}

            <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              Opening Stock is only for units physically in hand now. If the shipment arrives later, leave it at 0 and record
              the arrival through Stock In — the same units must never be counted twice.
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 -mx-6 mt-2 flex flex-col gap-2 border-t border-border bg-background px-6 py-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="outline" className="h-11" onClick={() => save(true)} disabled={saving}>
            Save Product &amp; Open Stock In
          </Button>
          <Button className="h-11" onClick={() => save(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Product'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
