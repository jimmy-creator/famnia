/**
 * Product catalogue — list, search, add/edit (images, variants, Arabic,
 * inventory settings), unlist, delete, CSV import/export.
 *
 * Self-contained (owns its own state and fetching) so the same screen is
 * served from both the store admin (/admin → Products) and the ERP
 * (/admin/erp?tab=products). Moved out of Admin.jsx unchanged.
 */
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { HiPhotograph, HiX, HiTrash } from 'react-icons/hi';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axios';
import ProductImage from '../ProductImage';
import { CURRENCY, PRICE_STEP, formatPrice, CURRENCY_DECIMALS } from '../../utils/currency';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const emptyProduct = {
  name: '', nameAr: '', code: '', barcode: '', description: '', descriptionAr: '',
  price: '', comparePrice: '', costPrice: '', marginPercent: '', preferredSupplierId: '',
  reorderLevel: '', reorderQty: '',
  category: '', categories: [], brand: '', stock: '', featured: false, images: [],
  variantOptions: null, variants: null,
};

function VariantEditor({ variantOptions, variants, onChange, basePrice }) {
  const [enabled, setEnabled] = useState(!!variantOptions && Object.keys(variantOptions || {}).length > 0);
  const [types, setTypes] = useState(() => {
    if (!variantOptions) return [];
    return Object.entries(variantOptions).map(([name, values]) => ({
      name,
      values: values.join(', '),
    }));
  });
  const [variantList, setVariantList] = useState(variants || []);

  const generateCombinations = (typesArr) => {
    const opts = typesArr
      .filter((t) => t.name.trim() && t.values.trim())
      .map((t) => ({
        name: t.name.trim(),
        values: t.values.split(',').map((v) => v.trim()).filter(Boolean),
      }));

    if (opts.length === 0) return { options: {}, combos: [] };

    const options = {};
    opts.forEach((o) => { options[o.name] = o.values; });

    // Generate all combinations
    const combos = opts.reduce((acc, opt) => {
      if (acc.length === 0) {
        return opt.values.map((v) => ({ [opt.name]: v }));
      }
      const result = [];
      acc.forEach((existing) => {
        opt.values.forEach((v) => {
          result.push({ ...existing, [opt.name]: v });
        });
      });
      return result;
    }, []);

    // Merge with existing variant data (preserve sku/barcode/price/stock)
    const merged = combos.map((combo) => {
      const key = JSON.stringify(combo);
      const existing = variantList.find((v) => JSON.stringify(v.options) === key);
      return {
        options: combo,
        sku: existing?.sku || '',
        barcode: existing?.barcode || '',
        price: existing?.price ?? basePrice ?? '',
        stock: existing?.stock ?? 0,
      };
    });

    return { options, combos: merged };
  };

  const handleToggle = (val) => {
    setEnabled(val);
    if (!val) {
      onChange(null, null);
      setTypes([]);
      setVariantList([]);
    } else {
      setTypes([{ name: 'Size', values: 'S, M, L, XL' }]);
    }
  };

  const handleTypesChange = (newTypes) => {
    setTypes(newTypes);
    const { options, combos } = generateCombinations(newTypes);
    setVariantList(combos);
    onChange(Object.keys(options).length > 0 ? options : null, combos.length > 0 ? combos : null);
  };

  const handleVariantFieldChange = (index, field, value) => {
    const updated = [...variantList];
    if (field === 'price') {
      updated[index][field] = value === '' ? null : parseFloat(value);
    } else if (field === 'stock') {
      updated[index][field] = parseInt(value) || 0;
    } else {
      updated[index][field] = value;
    }
    setVariantList(updated);

    const opts = {};
    types.filter((t) => t.name.trim() && t.values.trim()).forEach((t) => {
      opts[t.name.trim()] = t.values.split(',').map((v) => v.trim()).filter(Boolean);
    });
    onChange(Object.keys(opts).length > 0 ? opts : null, updated.length > 0 ? updated : null);
  };

  const totalVariantStock = variantList.reduce((sum, v) => sum + (v.stock || 0), 0);

  return (
    <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
      <label className="checkbox-label" style={{ paddingTop: 0, marginBottom: '1rem' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => handleToggle(e.target.checked)} />
        This product has variants (size, color, etc.)
      </label>

      {enabled && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
          <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Variant Types
          </h4>

          {types.map((type, i) => (
            <div key={i} className="form-row" style={{ marginBottom: '0.5rem', alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Type Name</label>
                <input
                  value={type.name}
                  onChange={(e) => {
                    const updated = [...types];
                    updated[i].name = e.target.value;
                    handleTypesChange(updated);
                  }}
                  placeholder="e.g. Size, Color"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
                <label>Values (comma separated)</label>
                <input
                  value={type.values}
                  onChange={(e) => {
                    const updated = [...types];
                    updated[i].values = e.target.value;
                    handleTypesChange(updated);
                  }}
                  placeholder="e.g. S, M, L, XL"
                />
              </div>
              <button
                type="button"
                onClick={() => handleTypesChange(types.filter((_, j) => j !== i))}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                  padding: '0.55rem', cursor: 'pointer', color: 'var(--danger)', display: 'flex',
                  marginBottom: '0',
                }}
              >
                <HiTrash />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => handleTypesChange([...types, { name: '', values: '' }])}
            style={{
              background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
              padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--copper)',
              fontWeight: 500, marginTop: '0.5rem', width: '100%',
            }}
          >
            + Add Variant Type
          </button>

          {variantList.length > 0 && (
            <>
              <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', margin: '1.25rem 0 0.75rem' }}>
                Variants ({variantList.length}) — Total Stock: {totalVariantStock}
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-warm)' }}>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Variant</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>SKU</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Barcode</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Price Override</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantList.map((v, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500 }}>
                          {Object.values(v.options).join(' / ')}
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input
                            value={v.sku}
                            onChange={(e) => handleVariantFieldChange(i, 'sku', e.target.value)}
                            placeholder="SKU"
                            style={{ padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', width: '100px' }}
                          />
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input
                            value={v.barcode || ''}
                            onChange={(e) => handleVariantFieldChange(i, 'barcode', e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                            placeholder="Scan / EAN"
                            style={{ padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', width: '120px' }}
                          />
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input
                            type="number"
                            step={PRICE_STEP}
                            value={v.price ?? ''}
                            onChange={(e) => handleVariantFieldChange(i, 'price', e.target.value)}
                            placeholder="Base price"
                            style={{ padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', width: '90px' }}
                          />
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>
                          <input
                            type="number"
                            value={v.stock}
                            onChange={(e) => handleVariantFieldChange(i, 'stock', e.target.value)}
                            style={{ padding: '0.35rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', width: '70px' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ImageUploader({ images = [], onChange }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFiles = async (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Please select image files');
      return;
    }

    setUploading(true);
    try {
      const uploaded = [];
      for (const file of imageFiles) {
        const formData = new FormData();
        formData.append('image', file);
        const { data } = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploaded.push(data.url);
      }
      onChange([...images, ...uploaded]);
      toast.success(`${uploaded.length} image${uploaded.length > 1 ? 's' : ''} uploaded`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  };

  const removeImage = (index) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="image-uploader">
      <label style={{
        fontSize: '0.72rem', fontWeight: 600,
        marginBottom: '0.5rem', display: 'block',
        color: 'var(--text-secondary)',
        letterSpacing: '1px', textTransform: 'uppercase',
      }}>
        Product Images
      </label>

      {/* Existing images */}
      {images.length > 0 && (
        <div style={{
          display: 'flex', gap: '0.75rem', flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}>
          {images.map((url, i) => (
            <div key={i} style={{
              position: 'relative', width: 90, height: 90,
              borderRadius: 'var(--radius)', overflow: 'hidden',
              border: '1px solid var(--border)',
            }}>
              <img
                src={url}
                alt={`Product ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 22, height: 22,
                  background: 'rgba(0,0,0,0.65)', color: 'white',
                  border: 'none', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: '0.75rem',
                  padding: 0,
                }}
              >
                <HiX />
              </button>
              {i === 0 && (
                <span style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.6)', color: 'white',
                  fontSize: '0.6rem', textAlign: 'center', padding: '2px 0',
                  fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase',
                }}>
                  Main
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? 'var(--copper)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s var(--ease)',
          background: dragOver ? 'rgba(196,120,74,0.04)' : 'var(--bg-warm)',
        }}
      >
        {uploading ? (
          <div style={{ color: 'var(--copper)', fontWeight: 500, fontSize: '0.88rem' }}>
            Uploading...
          </div>
        ) : (
          <>
            <HiPhotograph style={{
              fontSize: '2rem', color: 'var(--text-light)',
              marginBottom: '0.5rem',
            }} />
            <p style={{
              fontSize: '0.88rem', color: 'var(--text-secondary)',
              fontWeight: 500, marginBottom: '0.25rem',
            }}>
              Drop images here or click to browse
            </p>
            <p style={{
              fontSize: '0.75rem', color: 'var(--text-light)',
            }}>
              JPG, PNG, WebP up to 5MB
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => uploadFiles(e.target.files)}
      />
    </div>
  );
}

export default function ProductsManager() {
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [adminCategories, setAdminCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [showForm, setShowForm] = useState(false);

  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
    api.get('/categories/all').then((res) => setAdminCategories(res.data));
    api.get('/suppliers').then((res) => setSuppliers(res.data)).catch(() => {});
  }, []);

  // Cost + margin % → selling price (mirrors server utils/pricing.js), and
  // cost + price → margin %, so whichever two are typed fill in the third.
  const marginPrice = (cost, margin) => {
    const c = parseFloat(cost);
    const m = parseFloat(margin);
    return c > 0 && Number.isFinite(m) ? (c * (1 + m / 100)).toFixed(CURRENCY_DECIMALS) : null;
  };
  const priceMargin = (cost, price) => {
    const c = parseFloat(cost);
    const p = parseFloat(price);
    return c > 0 && Number.isFinite(p) ? String(+((p / c - 1) * 100).toFixed(2)) : null;
  };
  const onMargin = marginPrice(form.costPrice, form.marginPercent) != null;
  const setCostOrMargin = (patch) => {
    const next = { ...form, ...patch };
    const p = marginPrice(next.costPrice, next.marginPercent);
    if (p != null) { setForm({ ...next, price: p }); return; }
    // New cost with no margin yet: work the margin out from the price.
    const m = 'costPrice' in patch && next.marginPercent === '' ? priceMargin(next.costPrice, next.price) : null;
    setForm(m != null ? { ...next, marginPercent: m } : next);
  };
  const setPrice = (price) => {
    const m = priceMargin(form.costPrice, price);
    setForm({ ...form, price, ...(m != null && { marginPercent: m }) });
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    const cats = (form.categories || []).filter(Boolean);
    if (cats.length === 0) {
      toast.error('Select at least one category');
      return;
    }
    try {
      const payload = { ...form, categories: cats, category: cats[0] };
      // Blank numeric inputs must go to the API as null, not '' — an empty
      // string into an INTEGER/DECIMAL column is a MySQL error, not a no-op.
      for (const f of ['comparePrice', 'costPrice', 'marginPercent', 'weight', 'reorderLevel', 'reorderQty', 'preferredSupplierId']) {
        if (payload[f] === '' || payload[f] === undefined) payload[f] = null;
      }
      const { data: saved } = editing
        ? await api.put(`/products/${editing}`, payload)
        : await api.post('/products', payload);
      // With more than one branch the server can't tell which one received
      // the goods, so it won't guess — say so instead of letting the number
      // disappear on the next stock recompute.
      if (saved?.stockSync === 'ambiguous') {
        toast(`${editing ? 'Product updated' : 'Product created'} — set stock per branch under Inventory`,
          { icon: 'ℹ️', duration: 6000 });
      } else {
        toast.success(editing ? 'Product updated' : 'Product created');
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyProduct);
      const res = await api.get('/products/admin/all?limit=10000');
      setProducts(res.data.products);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    await api.delete(`/products/${id}`);
    setProducts(products.filter((p) => p.id !== id));
    toast.success('Deleted');
  };

  const handleToggleActive = async (id) => {
    try {
      const res = await api.patch(`/products/${id}/toggle-active`);
      setProducts(products.map((p) => p.id === id ? { ...p, active: res.data.active } : p));
      toast.success(res.data.active ? 'Product is now Active' : 'Product is now Unlisted');
    } catch {
      toast.error('Failed to update status');
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => { setShowForm(true); setEditing(null); setForm(emptyProduct); }}>
          <Plus className="size-4" /> Add Product
        </Button>
        <Button variant="outline" onClick={() => window.open('/api/bulk-products/export', '_blank')}>Export CSV</Button>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent">
          Import CSV
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              const formData = new FormData();
              formData.append('file', file);
              try {
                const { data } = await api.post('/bulk-products/import', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                toast.success(data.message);
                if (data.errors?.length > 0) {
                  data.errors.forEach((err) => toast.error(err));
                }
                api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
              } catch (error) {
                toast.error(error.response?.data?.message || 'Import failed');
              }
              e.target.value = '';
            }}
          />
        </label>
        <Button variant="outline" size="sm" onClick={() => window.open('/api/bulk-products/template', '_blank')} title="Stock sheet — SKU, colour breakdown, cost/selling price, reorder level">Template (stock sheet)</Button>
        <Button variant="outline" size="sm" onClick={() => window.open('/api/bulk-products/template?style=full', '_blank')} title="Full template with variants, Arabic and per-location stock">Template (full)</Button>
        <Button variant="outline" size="sm" onClick={() => window.open('/api/bulk-products/template?style=simple', '_blank')} title="Single-row legacy template — no variants, no Arabic">Template (simple)</Button>
      </div>

      <div className="mb-4">
        <Input
          type="search"
          value={productSearch}
          onChange={(e) => setProductSearch(e.target.value)}
          placeholder="Search by name, SKU, barcode, category, or brand"
          className="max-w-md"
        />
      </div>

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-h-[94vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProductSubmit} className="flex flex-col gap-4">
            <ImageUploader images={form.images || []} onChange={(images) => setForm({ ...form, images })} />

            <div className="flex flex-col gap-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Categories <span className="font-normal text-muted-foreground">(pick one or more — ★ is the primary)</span></Label>
              <div className="flex flex-wrap gap-2">
                {adminCategories.map((cat) => {
                  const cur = form.categories || [];
                  const idx = cur.indexOf(cat.name);
                  const selected = idx !== -1;
                  const isPrimary = idx === 0;
                  return (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => {
                        const next = selected ? cur.filter((c) => c !== cat.name) : [...cur, cat.name];
                        setForm({ ...form, categories: next, category: next[0] || '' });
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                        selected ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-accent',
                      )}
                    >
                      {isPrimary ? '★ ' : ''}{cat.name}
                    </button>
                  );
                })}
              </div>
              {(form.categories || []).length === 0 && (
                <p className="text-xs text-destructive">Select at least one category</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>

            {import.meta.env.VITE_FEATURE_I18N === 'true' && (
              <>
                <div className="flex flex-col gap-2">
                  <Label>Name (Arabic) <span className="font-normal text-muted-foreground">الاسم بالعربية</span></Label>
                  <Input dir="rtl" lang="ar" value={form.nameAr || ''} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} placeholder="اسم المنتج بالعربية" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Description (Arabic) <span className="font-normal text-muted-foreground">الوصف بالعربية</span></Label>
                  <Textarea dir="rtl" lang="ar" value={form.descriptionAr || ''} onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })} rows={3} placeholder="وصف المنتج بالعربية" />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label>Cost Price</Label>
                {/* step="any": a landed cost (with its share of PO shipping)
                    is rarely a round figure. */}
                <Input type="number" step="any" value={form.costPrice || ''} onChange={(e) => setCostOrMargin({ costPrice: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Margin %</Label>
                <Input type="number" step="any" value={form.marginPercent ?? ''} placeholder="none"
                  onChange={(e) => setCostOrMargin({ marginPercent: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Price</Label>
                <Input type="number" step={PRICE_STEP} value={form.price}
                  onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Compare Price</Label>
                <Input type="number" step={PRICE_STEP} value={form.comparePrice} onChange={(e) => setForm({ ...form, comparePrice: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Stock</Label>
                <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              {onMargin
                ? `Price = cost + ${parseFloat(form.marginPercent)}% (${CURRENCY} ${formatPrice(form.costPrice)} + ${formatPrice(form.price - form.costPrice)}). It follows the landed cost each time a purchase order is received. Clear Margin % to keep a fixed price.`
                : 'Type the cost and either a Margin % or a Price — the other fills in (cost includes the purchase order’s shipping share).'}
            </p>

            {/* ── Inventory settings ── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Reorder level</Label>
                <Input type="number" min="0" value={form.reorderLevel ?? ''} placeholder="no alert"
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Reorder qty</Label>
                <Input type="number" min="0" value={form.reorderQty ?? ''} placeholder="auto"
                  onChange={(e) => setForm({ ...form, reorderQty: e.target.value })} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Supplier</Label>
              <Select value={form.preferredSupplierId ? String(form.preferredSupplierId) : 'none'}
                onValueChange={(v) => setForm({ ...form, preferredSupplierId: v === 'none' ? '' : parseInt(v, 10) })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {suppliers.filter((s) => s.active || s.id === form.preferredSupplierId).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="flex flex-col gap-2">
                <Label>Brand</Label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>SKU / Product Code</Label>
                <Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Internal code (optional)" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Barcode</Label>
                {/* Enter is swallowed so a USB scanner's trailing Enter doesn't submit the form */}
                <Input value={form.barcode || ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                  placeholder="Scan or type EAN/UPC" />
              </div>
              <label className="flex items-center gap-2 pt-7 text-sm">
                <Checkbox checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: !!v })} /> Featured
              </label>
            </div>

            <div className="grid items-end gap-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={!!form.taxable} onCheckedChange={(v) => setForm({ ...form, taxable: !!v, taxRate: v ? (parseFloat(form.taxRate) || 5) : 0 })} /> Charge VAT
              </label>
              {form.taxable && (
                <>
                  <div className="flex flex-col gap-2">
                    <Label>VAT Rate (%)</Label>
                    <Select value={String(parseFloat(form.taxRate) || 5)} onValueChange={(v) => setForm({ ...form, taxRate: parseFloat(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['0', '5'].map((r) => <SelectItem key={r} value={r}>{r}%</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>HSN Code</Label>
                    <Input value={form.hsnCode || ''} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} placeholder="Optional" />
                  </div>
                </>
              )}
            </div>

            <VariantEditor
              variantOptions={form.variantOptions}
              variants={form.variants}
              basePrice={form.price}
              onChange={(variantOptions, variants) => {
                const totalStock = variants ? variants.reduce((s, v) => s + (v.stock || 0), 0) : form.stock;
                setForm({ ...form, variantOptions, variants, stock: totalStock });
              }}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit">{editing ? 'Update Product' : 'Create Product'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Image</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products
              .filter((p) => {
                const q = productSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  (p.name || '').toLowerCase().includes(q) ||
                  (p.code || '').toLowerCase().includes(q) ||
                  (p.barcode || '').toLowerCase().includes(q) ||
                  (p.category || '').toLowerCase().includes(q) ||
                  (p.brand || '').toLowerCase().includes(q)
                );
              })
              .map((p, i) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                <TableCell>
                  <div className="size-11 overflow-hidden rounded-md bg-muted">
                    <ProductImage product={p} size="small" />
                  </div>
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.category}</TableCell>
                <TableCell>{CURRENCY}{formatPrice(p.price)}</TableCell>
                <TableCell>{p.stock}</TableCell>
                <TableCell>{p.featured ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={p.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}>
                    {p.active ? 'Active' : 'Unlisted'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" title={p.active ? 'Unlist product' : 'Make active'} onClick={() => handleToggleActive(p.id)}>
                      {p.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setForm({
                          ...p,
                          images: p.images || [],
                          categories: (Array.isArray(p.categories) && p.categories.length) ? p.categories : (p.category ? [p.category] : []),
                          code: p.code || '',
                          barcode: p.barcode || '',
                          taxable: !!p.taxable,
                          taxRate: parseFloat(p.taxRate) || 0,
                          hsnCode: p.hsnCode || '',
                          reorderLevel: p.reorderLevel ?? '',
                          reorderQty: p.reorderQty ?? '',
                          marginPercent: p.marginPercent != null ? String(parseFloat(p.marginPercent)) : '',
                          preferredSupplierId: p.preferredSupplierId ?? '',
                        });
                        setEditing(p.id);
                        setShowForm(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
