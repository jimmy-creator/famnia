import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { HiPlus, HiPencil, HiTrash, HiPhotograph, HiX, HiEye, HiEyeOff, HiLogout } from 'react-icons/hi';
import ProductImage from '../components/ProductImage';
import { useTheme } from '../context/ThemeContext';
import { CURRENCY, PRICE_STEP } from '../utils/currency';
import PoModals from '../components/admin/PoModals';
import PurchaseReturnModals from '../components/admin/PurchaseReturnModals';
import FinanceTabs from '../components/admin/FinanceTabs';
import BarcodeLabels from '../components/admin/BarcodeLabels';
import StockCounts from '../components/admin/StockCounts';
import { Menu, LogOut, Plus, Pencil, Trash2, X, Eye, EyeOff, Search, Image as ImageIcon, Star, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const MULTILOC_ENABLED = import.meta.env.VITE_FEATURE_MULTILOC === 'true';

const emptyProduct = {
  name: '', nameAr: '', code: '', description: '', descriptionAr: '',
  price: '', comparePrice: '', costPrice: '',
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

    // Merge with existing variant data (preserve sku/price/stock)
    const merged = combos.map((combo) => {
      const key = JSON.stringify(combo);
      const existing = variantList.find((v) => JSON.stringify(v.options) === key);
      return {
        options: combo,
        sku: existing?.sku || '',
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

function BannerEditor({
  endpoint = '/settings/banners',
  title = 'Home Banners',
  description = 'Add up to 5 banner slides for the home page carousel. Each banner needs an image, and optionally a title, subtitle, and link.',
  maxBanners = 5,
}) {
  const [banners, setBanners] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get(endpoint).then((res) => {
      if (Array.isArray(res.data)) setBanners(res.data);
    }).catch(() => {});
  }, [endpoint]);

  const saveBanners = async (updated) => {
    try {
      await api.put(endpoint, { banners: updated });
      setBanners(updated);
      toast.success('Banners saved');
    } catch (err) {
      toast.error('Failed to save banners');
    }
  };

  const handleUpload = async (file) => {
    if (!file || banners.length >= maxBanners) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newBanner = { image: data.url, mobileImage: '', title: '', subtitle: '', link: '/products' };
      const updated = [...banners, newBanner];
      await saveBanners(updated);
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleUploadField = async (index, field, file) => {
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const updated = banners.map((b, i) => i === index ? { ...b, [field]: data.url } : b);
      await saveBanners(updated);
    } catch {
      toast.error('Upload failed');
    }
  };

  const updateBanner = (index, field, value) => {
    const updated = banners.map((b, i) => i === index ? { ...b, [field]: value } : b);
    setBanners(updated);
  };

  const removeBanner = (index) => {
    const updated = banners.filter((_, i) => i !== index);
    saveBanners(updated);
  };

  const moveBanner = (index, dir) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= banners.length) return;
    const updated = [...banners];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    saveBanners(updated);
  };

  return (
    <div style={{ marginTop: '3rem' }}>
      <h3 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
        {title} ({banners.length}/{maxBanners})
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        {description}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
        {banners.map((banner, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '160px 90px 1fr auto',
            gap: '1rem',
            padding: '1rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-card)',
            alignItems: 'start',
          }}>
            {/* Desktop image */}
            <label style={{ cursor: 'pointer', display: 'block' }} title="Desktop image (click to replace)">
              <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', aspectRatio: '16/10', background: 'var(--bg-warm)' }}>
                <img src={banner.image} alt="Desktop banner" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <span style={{ display: 'block', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Desktop</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUploadField(i, 'image', e.target.files[0])} />
            </label>

            {/* Mobile image (portrait) */}
            <label style={{ cursor: 'pointer', display: 'block' }} title="Mobile image (click to upload/replace)">
              <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', aspectRatio: '5/7', background: 'var(--bg-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: banner.mobileImage ? 'none' : '1.5px dashed var(--border)' }}>
                {banner.mobileImage ? (
                  <img src={banner.mobileImage} alt="Mobile banner" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', textAlign: 'center', padding: '0 0.4rem' }}>+ Add</span>
                )}
              </div>
              <span style={{ display: 'block', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mobile</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUploadField(i, 'mobileImage', e.target.files[0])} />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                value={banner.title || ''}
                onChange={(e) => updateBanner(i, 'title', e.target.value)}
                onBlur={() => saveBanners(banners)}
                placeholder="Banner title (e.g. Traditional style for the new generation.)"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.88rem', background: 'var(--bg-warm)' }}
              />
              <input
                value={banner.subtitle || ''}
                onChange={(e) => updateBanner(i, 'subtitle', e.target.value)}
                onBlur={() => saveBanners(banners)}
                placeholder="Subtitle (e.g. Kids Collection)"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', background: 'var(--bg-warm)' }}
              />
              <input
                value={banner.link || ''}
                onChange={(e) => updateBanner(i, 'link', e.target.value)}
                onBlur={() => saveBanners(banners)}
                placeholder="Link (e.g. /products?category=Kids)"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', background: 'var(--bg-warm)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <button
                onClick={() => moveBanner(i, -1)}
                disabled={i === 0}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-warm)', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, fontSize: '0.75rem' }}
              >
                ▲
              </button>
              <button
                onClick={() => moveBanner(i, 1)}
                disabled={i === banners.length - 1}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-warm)', cursor: i === banners.length - 1 ? 'default' : 'pointer', opacity: i === banners.length - 1 ? 0.3 : 1, fontSize: '0.75rem' }}
              >
                ▼
              </button>
              <button
                onClick={() => removeBanner(i)}
                style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem' }}
              >
                <HiTrash />
              </button>
            </div>
          </div>
        ))}
      </div>

      {banners.length < maxBanners && (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.7rem 1.5rem', border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)', cursor: 'pointer',
          fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)',
          transition: 'all 0.25s ease',
        }}>
          <HiPhotograph style={{ fontSize: '1.2rem' }} />
          {uploading ? 'Uploading...' : 'Add Banner Image'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files[0])}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}

function CategoryCardsEditor() {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    api.get('/settings/category-cards')
      .then((res) => setCards(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const save = async (next) => {
    try {
      await api.put('/settings/category-cards', { cards: next });
      setCards(next);
      toast.success('Category cards saved');
    } catch {
      toast.error('Failed to save category cards');
    }
  };

  const update = (i, field, value) => {
    setCards(cards.map((c, j) => j === i ? { ...c, [field]: value } : c));
  };

  const uploadField = async (i, field, file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      save(cards.map((c, j) => j === i ? { ...c, [field]: data.url } : c));
    } catch {
      toast.error('Upload failed');
    }
  };

  const addCard = () => {
    if (cards.length >= 8) return;
    save([...cards, { title: '', bgColor: '#2c5f7d', image: '', mobileImage: '', link: '/products' }]);
  };

  const remove = (i) => save(cards.filter((_, j) => j !== i));

  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cards.length) return;
    const next = [...cards];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div style={{ marginTop: '3rem' }}>
      <h3 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
        Category Cards ({cards.length}/8)
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        Large coloured promo tiles shown on the home page in a 2×2 grid (desktop) or horizontal scroll (mobile). Each card has a background colour, a title, a product photo, and a link.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '160px 90px 80px 1fr auto',
            gap: '1rem',
            padding: '1rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-card)',
            alignItems: 'start',
          }}>
            <label style={{ cursor: 'pointer' }} title="Desktop product photo">
              <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', aspectRatio: '16/10', background: c.bgColor || 'var(--bg-warm)' }}>
                {c.image && <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />}
              </div>
              <span style={{ display: 'block', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Desktop image</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadField(i, 'image', e.target.files[0])} />
            </label>

            <label style={{ cursor: 'pointer' }} title="Mobile photo (optional)">
              <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', aspectRatio: '5/7', background: c.bgColor || 'var(--bg-warm)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: c.mobileImage ? 'none' : '1.5px dashed var(--border)' }}>
                {c.mobileImage
                  ? <img src={c.mobileImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  : <span style={{ fontSize: '0.7rem', color: 'var(--text-light)' }}>+ Add</span>}
              </div>
              <span style={{ display: 'block', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mobile</span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadField(i, 'mobileImage', e.target.files[0])} />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }} title="Background colour">
              <input
                type="color"
                value={c.bgColor || '#2c5f7d'}
                onChange={(e) => update(i, 'bgColor', e.target.value)}
                onBlur={() => save(cards)}
                style={{ width: 60, height: 60, border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', padding: 0, background: 'transparent' }}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Color</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <input
                value={c.title || ''}
                onChange={(e) => update(i, 'title', e.target.value)}
                onBlur={() => save(cards)}
                placeholder="Card title (e.g. Date Bites)"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.88rem', background: 'var(--bg-warm)' }}
              />
              <input
                value={c.link || ''}
                onChange={(e) => update(i, 'link', e.target.value)}
                onBlur={() => save(cards)}
                placeholder="Link (e.g. /products?category=Snacks)"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.82rem', background: 'var(--bg-warm)' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-warm)', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.3 : 1, fontSize: '0.75rem' }}>▲</button>
              <button onClick={() => move(i, 1)} disabled={i === cards.length - 1} style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-warm)', cursor: i === cards.length - 1 ? 'default' : 'pointer', opacity: i === cards.length - 1 ? 0.3 : 1, fontSize: '0.75rem' }}>▼</button>
              <button onClick={() => remove(i)} style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem' }}><HiTrash /></button>
            </div>
          </div>
        ))}
      </div>

      {cards.length < 8 && (
        <button type="button" className="btn btn-secondary" onClick={addCard}>
          <HiPlus /> Add Category Card
        </button>
      )}
    </div>
  );
}

function B2BBankDetailsEditor() {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/settings/b2b-bank-details')
      .then((res) => setValue(res.data.value || ''))
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/settings/b2b-bank-details', { value });
      toast.success('Bank details saved');
    } catch {
      toast.error('Failed to save bank details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: '3rem' }}>
      <h3 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
        B2B Bank Transfer Details
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        Shown in the quote email when you pick the <strong>Bank Transfer</strong> payment method. Free-form text — account name, number, IFSC, branch, UPI ID, anything you want the customer to see.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        placeholder={'Account Name: Kalif Dates & Nuts (Tamar International)\nA/c No: XXXXXXXXXXXX\nIFSC: XXXX0000000\nBank: Example Bank, Kondotty Branch\nUPI: kalif@upi'}
        style={{ width: '100%', padding: '0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.88rem', fontFamily: 'inherit', background: 'var(--bg-warm)', resize: 'vertical' }}
      />
      <button type="button" onClick={save} disabled={saving} className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
        {saving ? 'Saving…' : 'Save bank details'}
      </button>
    </div>
  );
}

function AnnouncementEditor() {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    api.get('/settings/announcements')
      .then((res) => setItems(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const save = async (next) => {
    try {
      await api.put('/settings/announcements', { items: next });
      setItems(next);
      toast.success('Announcements saved');
    } catch {
      toast.error('Failed to save announcements');
    }
  };

  const add = () => {
    const v = draft.trim();
    if (!v || items.length >= 10) return;
    save([...items, v]);
    setDraft('');
  };

  return (
    <div style={{ marginTop: '3rem' }}>
      <h3 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
        Announcement Bar ({items.length}/10)
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        Short promo strings that scroll across the top of every page (above the navbar). Up to 10 messages.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {items.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.6rem 0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-warm)' }}>
            <span style={{ flex: 1, fontSize: '0.88rem' }}>{s}</span>
            <button
              type="button"
              onClick={() => save(items.filter((_, j) => j !== i))}
              style={{ padding: '0.3rem 0.6rem', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              <HiTrash />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder='e.g. "Free shipping on orders over 500"'
          disabled={items.length >= 10}
          style={{ flex: 1, padding: '0.6rem 0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.88rem', background: 'var(--bg-warm)' }}
        />
        <button type="button" onClick={add} disabled={!draft.trim() || items.length >= 10} className="btn btn-secondary">
          <HiPlus /> Add
        </button>
      </div>
    </div>
  );
}

function HeroBannerEditor() {
  const [heroImage, setHeroImage] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.get('/settings/hero-image').then((res) => {
      if (res.data.value) setHeroImage(res.data.value);
    }).catch(() => {});
  }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const { data } = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setHeroImage(data.url);
      await api.put('/settings/hero-image', { value: data.url });
      toast.success('Hero banner updated');
    } catch (err) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ marginTop: '3rem' }}>
      <h3 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
        Hero Banner Image
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        This image appears as the main banner on the home page.
      </p>

      {heroImage && (
        <div style={{ marginBottom: '1rem', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-light)', maxWidth: '500px' }}>
          <img src={heroImage} alt="Hero Banner" style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
        </div>
      )}

      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.7rem 1.5rem', border: '2px dashed var(--border)',
        borderRadius: 'var(--radius-lg)', cursor: 'pointer',
        fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-secondary)',
        transition: 'all 0.25s ease',
      }}>
        <HiPhotograph style={{ fontSize: '1.2rem' }} />
        {uploading ? 'Uploading...' : heroImage ? 'Change Banner' : 'Upload Banner Image'}
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files[0])}
        />
      </label>
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

export default function Admin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { currentTheme, changeTheme, themes: themeOptions } = useTheme();

  const handleLogout = async () => {
    try { await logout(); } catch { /* clear client state regardless */ }
    navigate('/login');
  };
  const [tab, setTab] = useState(() => {
    if (user?.role === 'staff' && user?.permissions?.length > 0) {
      const permToTab = { analytics: 'dashboard', products: 'products', orders: 'orders', categories: 'categories', customers: 'customers', coupons: 'coupons', reviews: 'reviews', settings: 'theme' };
      return permToTab[user.permissions[0]] || 'dashboard';
    }
    return 'dashboard';
  });
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [couponForm, setCouponForm] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewForm, setReviewForm] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [guestCustomers, setGuestCustomers] = useState([]);
  const [customerView, setCustomerView] = useState('registered');
  const [customerOrders, setCustomerOrders] = useState(null); // { name, orders }
  const [customerSearch, setCustomerSearch] = useState('');
  const [adminCategories, setAdminCategories] = useState([]);
  const [catForm, setCatForm] = useState(null);
  const [catUploading, setCatUploading] = useState(false);
  const [pincodes, setPincodes] = useState([]);
  const [pincodeForm, setPincodeForm] = useState(null);
  const [pincodeSearch, setPincodeSearch] = useState('');
  const [bulkPincodes, setBulkPincodes] = useState('');
  const [abandonedCarts, setAbandonedCarts] = useState([]);
  const [abandonedStats, setAbandonedStats] = useState({});
  const [abandonedFilter, setAbandonedFilter] = useState('');
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [staffForm, setStaffForm] = useState(null);
  const [availablePerms, setAvailablePerms] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [revenueChart, setRevenueChart] = useState([]);
  const [chartPeriod, setChartPeriod] = useState('30days');
  const [topProducts, setTopProducts] = useState([]);
  const [orderStatus, setOrderStatus] = useState({});
  const [recentOrders, setRecentOrders] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [availableGateways, setAvailableGateways] = useState([]);
  const [b2bQuotes, setB2bQuotes] = useState([]);
  const [b2bQuoteForm, setB2bQuoteForm] = useState(null);
  const [b2bStatusFilter, setB2bStatusFilter] = useState('');
  const [shipModal, setShipModal] = useState(null);     // order being managed in the shipping modal
  const [shipBusy, setShipBusy] = useState(false);

  // ── Multi-location inventory + stock transfers ──────────────────
  const [locations, setLocations] = useState([]);
  const [locationForm, setLocationForm] = useState(null);
  const [invProductId, setInvProductId] = useState(null);   // product whose per-location grid is open
  const [invDetail, setInvDetail] = useState(null);          // { product, locations, stocks }
  const [invDraft, setInvDraft] = useState({});              // key `${variantIdx ?? 'b'}:${locationId}` → quantity string
  const [invBusy, setInvBusy] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [transferForm, setTransferForm] = useState(null);    // new-transfer modal state
  const [transferStatusFilter, setTransferStatusFilter] = useState('');
  const [cashiers, setCashiers] = useState([]);
  const [cashierForm, setCashierForm] = useState(null);      // { name, email, password, pin, homeLocationId, _editing }
  const [shifts, setShifts] = useState([]);
  const [reportType, setReportType] = useState('cashier');   // 'cashier' | 'location'
  const [reportFrom, setReportFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportFilterCashier, setReportFilterCashier] = useState('');
  const [reportFilterLocation, setReportFilterLocation] = useState('');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [salesReturns, setSalesReturns] = useState([]);
  const [returnsFilter, setReturnsFilter] = useState({ from: '', to: '', locationId: '', refundMethod: '' });
  const [returnDetail, setReturnDetail] = useState(null);
  // Purchasing — Phase B
  const [suppliers, setSuppliers] = useState([]);
  const [supplierForm, setSupplierForm] = useState(null);
  const [supplierDetail, setSupplierDetail] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poFilter, setPoFilter] = useState({ status: '', supplierId: '', locationId: '' });
  const [poForm, setPoForm] = useState(null);          // editor (new/edit)
  const [poDetail, setPoDetail] = useState(null);      // detail modal with actions
  const [receiveForm, setReceiveForm] = useState(null);// { poId, items: [{...}] }
  const [payForm, setPayForm] = useState(null);        // { poId, amount, method, ref, notes }
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [prFilter, setPrFilter] = useState({ from: '', to: '', supplierId: '', locationId: '' });
  const [prForm, setPrForm] = useState(null);          // new purchase-return form
  const [prDetail, setPrDetail] = useState(null);
  // Finance — Phase C
  const [cashAccounts, setCashAccounts] = useState([]);
  const [cashAccountForm, setCashAccountForm] = useState(null);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseFilter, setExpenseFilter] = useState({ from: '', to: '', categoryId: '', locationId: '' });
  const [expenseForm, setExpenseForm] = useState(null);
  const [expenseCatForm, setExpenseCatForm] = useState(null);
  const [cashTransfers, setCashTransfers] = useState([]);
  const [cashTransferForm, setCashTransferForm] = useState(null);
  const [dailyCash, setDailyCash] = useState(null);
  const [dailyCashFilter, setDailyCashFilter] = useState({ date: new Date().toISOString().slice(0, 10), locationId: '' });
  // Phase D: Daybook / P&L / Stock Value
  const [daybook, setDaybook] = useState(null);
  const [daybookFilter, setDaybookFilter] = useState({ date: new Date().toISOString().slice(0, 10), accountId: '', source: '' });
  const [pnl, setPnl] = useState(null);
  const [pnlFilter, setPnlFilter] = useState(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
      locationId: '',
    };
  });
  const [stockValue, setStockValue] = useState(null);
  const [stockValueFilter, setStockValueFilter] = useState({ locationId: '' });
  const [activityLog, setActivityLog] = useState([]);
  const [activityFilter, setActivityFilter] = useState({ from: '', to: '', action: '', managerOnly: false });
  const [activityDetail, setActivityDetail] = useState(null);
  const [activeStockCountId, setActiveStockCountId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('admin_collapsed_sections') || '[]')); }
    catch { return new Set(); }
  });
  const toggleSection = (id) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('admin_collapsed_sections', JSON.stringify([...next]));
      return next;
    });
  };
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyProduct);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (tab === 'dashboard') {
      Promise.all([
        api.get('/analytics/overview'),
        api.get(`/analytics/revenue-chart?period=${chartPeriod}`),
        api.get('/analytics/top-products'),
        api.get('/analytics/order-status'),
        api.get('/analytics/recent-orders'),
        api.get('/analytics/payment-methods'),
        api.get('/analytics/low-stock'),
      ]).then(([ov, rc, tp, os, ro, pm, ls]) => {
        setDashboard(ov.data);
        setRevenueChart(rc.data);
        setTopProducts(tp.data);
        setOrderStatus(os.data);
        setRecentOrders(ro.data);
        setPaymentMethods(pm.data);
        setLowStockProducts(ls.data);
      }).catch(console.error);
    } else if (tab === 'products') {
      api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
      if (adminCategories.length === 0) api.get('/categories/all').then((res) => setAdminCategories(res.data));
    } else if (tab === 'orders') {
      api.get('/orders/all?limit=50').then((res) => setOrders(res.data.orders));
    } else if (tab === 'coupons') {
      api.get('/coupons').then((res) => setCoupons(res.data));
      if (products.length === 0) api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
      if (adminCategories.length === 0) api.get('/categories/all').then((res) => setAdminCategories(res.data));
      if (availableGateways.length === 0) api.get('/payment/gateways').then((res) => setAvailableGateways(res.data));
    } else if (tab === 'categories') {
      api.get('/categories/all').then((res) => setAdminCategories(res.data));
    } else if (tab === 'customers') {
      api.get(`/customers?search=${customerSearch}`).then((res) => setCustomers(res.data.customers));
      api.get('/customers/guests').then((res) => setGuestCustomers(res.data));
    } else if (tab === 'abandoned') {
      api.get(`/abandoned-cart?status=${abandonedFilter}`).then((res) => {
        setAbandonedCarts(res.data.carts);
        setAbandonedStats(res.data.stats);
      });
    } else if (tab === 'pincodes') {
      api.get(`/pincodes?search=${pincodeSearch}&limit=100`).then((res) => setPincodes(res.data.pincodes));
    } else if (tab === 'staff') {
      api.get('/staff').then((res) => setStaffList(res.data)).catch(() => {});
      api.get('/staff/permissions').then((res) => setAvailablePerms(res.data)).catch(() => {});
    } else if (tab === 'reviews') {
      api.get('/reviews/all').then((res) => setReviews(res.data.reviews));
      if (products.length === 0) {
        api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
      }
    } else if (tab === 'b2bquotes') {
      const qs = b2bStatusFilter ? `?status=${b2bStatusFilter}` : '';
      api.get(`/b2b/requests${qs}`).then((res) => setB2bQuotes(res.data)).catch(() => {});
    } else if (tab === 'locations') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
    } else if (tab === 'inventory') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      if (products.length === 0) api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
    } else if (tab === 'transfers') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
      api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data)).catch(() => {});
    } else if (tab === 'cashiers') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      api.get('/staff?role=cashier').then((res) => setCashiers(res.data)).catch(() => {
        // Fallback if /staff doesn't filter by role — fetch all then filter
        api.get('/staff').then((r) => setCashiers((r.data || []).filter((u) => u.role === 'cashier'))).catch(() => {});
      });
      api.get('/cashier/shifts?limit=50').then((res) => setShifts(res.data)).catch(() => {});
    } else if (tab === 'pos-reports') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      api.get('/staff?role=cashier').then((res) => setCashiers(res.data)).catch(() => {});
    } else if (tab === 'returns') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      const params = {};
      if (returnsFilter.from) params.from = new Date(returnsFilter.from + 'T00:00:00').toISOString();
      if (returnsFilter.to) params.to = new Date(returnsFilter.to + 'T23:59:59.999').toISOString();
      if (returnsFilter.locationId) params.locationId = returnsFilter.locationId;
      if (returnsFilter.refundMethod) params.refundMethod = returnsFilter.refundMethod;
      api.get('/returns', { params }).then((res) => setSalesReturns(res.data)).catch(() => {});
    } else if (tab === 'suppliers') {
      api.get('/suppliers').then((res) => setSuppliers(res.data)).catch(() => {});
    } else if (tab === 'purchase-orders') {
      api.get('/suppliers?active=true').then((res) => setSuppliers(res.data)).catch(() => {});
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      if (products.length === 0) api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
      const params = {};
      if (poFilter.status) params.status = poFilter.status;
      if (poFilter.supplierId) params.supplierId = poFilter.supplierId;
      if (poFilter.locationId) params.locationId = poFilter.locationId;
      api.get('/purchase-orders', { params }).then((res) => setPurchaseOrders(res.data)).catch(() => {});
    } else if (tab === 'stock-counts' || tab === 'stock-count-detail' || tab === 'variance-report') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      api.get('/finance/cash-accounts?active=true').then((res) => setCashAccounts(res.data)).catch(() => {});
      api.get('/finance/expense-categories').then((res) => setExpenseCategories(res.data)).catch(() => {});
    } else if (tab === 'cash-accounts') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      api.get('/finance/cash-accounts').then((res) => setCashAccounts(res.data)).catch(() => {});
    } else if (tab === 'expenses') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      api.get('/finance/cash-accounts?active=true').then((res) => setCashAccounts(res.data)).catch(() => {});
      api.get('/finance/expense-categories').then((res) => setExpenseCategories(res.data)).catch(() => {});
      const params = {};
      if (expenseFilter.from) params.from = new Date(expenseFilter.from + 'T00:00:00').toISOString();
      if (expenseFilter.to) params.to = new Date(expenseFilter.to + 'T23:59:59.999').toISOString();
      if (expenseFilter.categoryId) params.expenseCategoryId = expenseFilter.categoryId;
      if (expenseFilter.locationId) params.locationId = expenseFilter.locationId;
      api.get('/finance/expenses', { params }).then((res) => setExpenses(res.data)).catch(() => {});
    } else if (tab === 'cash-transfers') {
      api.get('/finance/cash-accounts?active=true').then((res) => setCashAccounts(res.data)).catch(() => {});
      api.get('/finance/cash-transfers').then((res) => setCashTransfers(res.data)).catch(() => {});
    } else if (tab === 'daily-cash') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      const params = { date: dailyCashFilter.date };
      if (dailyCashFilter.locationId) params.locationId = dailyCashFilter.locationId;
      api.get('/finance/daily-cash', { params }).then((res) => setDailyCash(res.data)).catch(() => {});
    } else if (tab === 'daybook') {
      api.get('/finance/cash-accounts?active=true').then((res) => setCashAccounts(res.data)).catch(() => {});
      const params = { date: daybookFilter.date };
      if (daybookFilter.accountId) params.accountId = daybookFilter.accountId;
      if (daybookFilter.source) params.source = daybookFilter.source;
      api.get('/finance/daybook', { params }).then((res) => setDaybook(res.data)).catch(() => {});
    } else if (tab === 'pnl') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      const params = {
        from: new Date(pnlFilter.from + 'T00:00:00').toISOString(),
        to: new Date(pnlFilter.to + 'T23:59:59.999').toISOString(),
      };
      if (pnlFilter.locationId) params.locationId = pnlFilter.locationId;
      api.get('/finance/pnl', { params }).then((res) => setPnl(res.data)).catch(() => {});
    } else if (tab === 'stock-value') {
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      const params = {};
      if (stockValueFilter.locationId) params.locationId = stockValueFilter.locationId;
      api.get('/finance/stock-value', { params }).then((res) => setStockValue(res.data)).catch(() => {});
    } else if (tab === 'activity-log') {
      const params = {};
      if (activityFilter.from) params.from = new Date(activityFilter.from + 'T00:00:00').toISOString();
      if (activityFilter.to) params.to = new Date(activityFilter.to + 'T23:59:59.999').toISOString();
      if (activityFilter.action) params.action = activityFilter.action;
      if (activityFilter.managerOnly) params.managerOnly = 'true';
      api.get('/activity-log', { params }).then((res) => setActivityLog(res.data)).catch(() => {});
    } else if (tab === 'purchase-returns') {
      api.get('/suppliers?active=true').then((res) => setSuppliers(res.data)).catch(() => {});
      api.get('/locations').then((res) => setLocations(res.data)).catch(() => {});
      if (products.length === 0) api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
      const params = {};
      if (prFilter.from) params.from = new Date(prFilter.from + 'T00:00:00').toISOString();
      if (prFilter.to) params.to = new Date(prFilter.to + 'T23:59:59.999').toISOString();
      if (prFilter.supplierId) params.supplierId = prFilter.supplierId;
      if (prFilter.locationId) params.locationId = prFilter.locationId;
      api.get('/purchase-returns', { params }).then((res) => setPurchaseReturns(res.data)).catch(() => {});
    }
  }, [tab, chartPeriod, customerSearch, pincodeSearch, abandonedFilter, b2bStatusFilter, transferStatusFilter, returnsFilter, poFilter, prFilter, expenseFilter, dailyCashFilter, daybookFilter, pnlFilter, stockValueFilter, activityFilter]);

  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const userPerms = user?.permissions || [];

  const hasAccess = (perm) => isAdmin || userPerms.includes(perm);

  // ─── Sidebar nav structure ──────────────────────────────────────
  // `show` is computed per render so role/feature gating stays live.
  const NAV_SECTIONS = [
    { id: 'catalog', label: 'Catalog', items: [
        { tab: 'products',         label: 'Products',        show: hasAccess('products') },
        { tab: 'categories',       label: 'Categories',      show: hasAccess('categories') },
        { tab: 'inventory',        label: 'Inventory',       show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'locations',        label: 'Locations',       show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'transfers',        label: 'Stock Transfers', show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'stock-counts',     label: 'Stock Counts',    show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'barcode-labels',   label: 'Barcode Labels',  show: MULTILOC_ENABLED && hasAccess('products') },
    ]},
    { id: 'purchasing', label: 'Purchasing', items: [
        { tab: 'suppliers',        label: 'Suppliers',        show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'purchase-orders',  label: 'Purchase Orders',  show: MULTILOC_ENABLED && hasAccess('products') },
        { tab: 'purchase-returns', label: 'Purchase Returns', show: MULTILOC_ENABLED && hasAccess('products') },
    ]},
    { id: 'finance', label: 'Finance', items: [
        { tab: 'cash-accounts',  label: 'Cash Accounts',  show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'expenses',       label: 'Expenses',       show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'cash-transfers', label: 'Cash Transfers', show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'daily-cash',     label: 'Daily Cash',     show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'daybook',        label: 'Daybook',        show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'pnl',            label: 'Profit & Loss',  show: MULTILOC_ENABLED && hasAccess('analytics') },
        { tab: 'stock-value',    label: 'Stock Value',    show: MULTILOC_ENABLED && hasAccess('analytics') },
    ]},
    { id: 'sales', label: 'Sales', items: [
        { tab: 'orders',      label: 'Orders',      show: hasAccess('orders') },
        { tab: 'returns',     label: 'Returns',     show: MULTILOC_ENABLED && hasAccess('orders') },
        { tab: 'abandoned',   label: 'Abandoned',   show: hasAccess('orders') },
        { tab: 'b2bquotes',   label: 'B2B Quotes',  show: hasAccess('orders') },
        { tab: 'pos-reports', label: 'POS Reports', show: MULTILOC_ENABLED && hasAccess('analytics') },
    ]},
    { id: 'people', label: 'People', items: [
        { tab: 'customers',    label: 'Customers',    show: hasAccess('customers') },
        { tab: 'reviews',      label: 'Reviews',      show: hasAccess('reviews') },
        { tab: 'staff',        label: 'Staff',        show: isAdmin },
        { tab: 'cashiers',     label: 'Cashiers',     show: MULTILOC_ENABLED && isAdmin },
        { tab: 'activity-log', label: 'Activity Log', show: MULTILOC_ENABLED && hasAccess('analytics') },
    ]},
    { id: 'settings', label: 'Settings', items: [
        { tab: 'coupons',  label: 'Coupons',  show: hasAccess('coupons') },
        { tab: 'pincodes', label: 'Pincodes', show: false },
        { tab: 'theme',    label: 'Theme',    show: hasAccess('settings') },
    ]},
  ];

  // Auto-expand the section containing the active tab so a tab switch is
  // always visible even if the user had collapsed that section earlier.
  useEffect(() => {
    const sec = NAV_SECTIONS.find((s) => s.items.some((i) => i.tab === tab && i.show));
    if (sec && collapsedSections.has(sec.id)) {
      setCollapsedSections((prev) => {
        const n = new Set(prev); n.delete(sec.id); return n;
      });
    }
    setSidebarOpen(false);   // close mobile drawer on tab change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  if (!isAdmin && !isStaff) {
    return <div className="flex min-h-[60vh] items-center justify-center"><h2 className="font-serif text-2xl font-semibold">Access Denied</h2></div>;
  }

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    const cats = (form.categories || []).filter(Boolean);
    if (cats.length === 0) {
      toast.error('Select at least one category');
      return;
    }
    try {
      const payload = { ...form, categories: cats, category: cats[0] };
      if (editing) {
        await api.put(`/products/${editing}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/products', payload);
        toast.success('Product created');
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

  const handleStatusChange = async (orderId, orderStatus) => {
    await api.put(`/orders/${orderId}/status`, { orderStatus });
    setOrders(orders.map((o) => o.id === orderId ? { ...o, orderStatus } : o));
    toast.success('Status updated');
  };

  // Pretty label for the active tab — shown in the mobile top bar.
  const activeLabel = (() => {
    if (tab === 'dashboard') return 'Dashboard';
    for (const s of NAV_SECTIONS) {
      const i = s.items.find((x) => x.tab === tab);
      if (i) return i.label;
    }
    return '';
  })();

  const statusColors = { processing: '#f59e0b', confirmed: '#3b82f6', shipped: '#8b5cf6', delivered: '#10b981', cancelled: '#ef4444' };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        {/* Mobile top bar */}
        <button
          className="fixed left-0 right-0 top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 text-sm font-medium backdrop-blur lg:hidden"
          onClick={() => setSidebarOpen((s) => !s)}
        >
          <Menu className="size-5" /> {activeLabel || 'Menu'}
        </button>
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        <aside className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-border bg-card p-3 transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}>
          <div className="px-3 py-3 font-serif text-xl font-semibold tracking-wide">Admin</div>
          {hasAccess('analytics') && (
            <button
              className={cn(
                'rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent',
                tab === 'dashboard' && 'bg-primary/10 text-primary',
              )}
              onClick={() => setTab('dashboard')}>
              Dashboard
            </button>
          )}
          {NAV_SECTIONS.map((section) => {
            const visible = section.items.filter((i) => i.show);
            if (visible.length === 0) return null;
            const collapsed = collapsedSections.has(section.id);
            return (
              <div key={section.id} className="mt-2">
                <button
                  className="flex w-full items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  onClick={() => toggleSection(section.id)}>
                  <span className="text-[10px]">{collapsed ? '▸' : '▾'}</span>
                  {section.label}
                </button>
                {!collapsed && visible.map((i) => (
                  <button
                    key={i.tab}
                    className={cn(
                      'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                      tab === i.tab && 'bg-primary/10 font-medium text-primary',
                    )}
                    onClick={() => setTab(i.tab)}>
                    {i.label}
                  </button>
                ))}
              </div>
            );
          })}
          <button
            className="mt-3 flex items-center gap-2 border-t border-border px-3 pt-3 text-sm text-destructive transition-colors hover:bg-accent"
            onClick={handleLogout}
          >
            <LogOut className="size-4" /> Logout{user?.name ? ` (${user.name})` : ''}
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-16 pt-16 lg:px-8 lg:pt-8">
          <h1 className="mb-6 font-serif text-2xl font-semibold tracking-tight">Admin Panel</h1>

        {tab === 'dashboard' && dashboard && (
          <div className="flex flex-col gap-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: 'Total Revenue', value: `${CURRENCY}${Number(dashboard.revenue.total || 0).toLocaleString('en-IN')}`,
                  sub: <span className={(dashboard.revenue.growth || 0) >= 0 ? 'text-emerald-600' : 'text-destructive'}>{(dashboard.revenue.growth || 0) >= 0 ? '↑' : '↓'} {Math.abs(dashboard.revenue.growth || 0)}% vs last month</span> },
                { label: 'This Month', value: `${CURRENCY}${Number(dashboard.revenue.month || 0).toLocaleString('en-IN')}`, sub: `Today: ${CURRENCY}${Number(dashboard.revenue.today || 0).toLocaleString('en-IN')}` },
                { label: 'Orders', value: dashboard.orders.total, sub: `${dashboard.orders.pending} pending · ${dashboard.orders.today} today` },
                { label: 'Customers', value: dashboard.customers.total, sub: `${dashboard.customers.new} new this month` },
              ].map((c) => (
                <div key={c.label} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</div>
                  <div className="mt-1 text-2xl font-semibold">{c.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Revenue Chart */}
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium">Revenue</h3>
                  <div className="flex items-center rounded-md border border-input p-0.5 text-xs">
                    <button className={cn('rounded px-2 py-1', chartPeriod === '30days' && 'bg-secondary font-medium')} onClick={() => setChartPeriod('30days')}>30 Days</button>
                    <button className={cn('rounded px-2 py-1', chartPeriod === '12months' && 'bg-secondary font-medium')} onClick={() => setChartPeriod('12months')}>12 Months</button>
                  </div>
                </div>
                {revenueChart.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No revenue data yet</p>
                ) : (
                  <div className="flex h-44 items-end gap-1">
                    {(() => {
                      const maxRev = Math.max(...revenueChart.map((d) => Number(d.revenue || 0)), 1);
                      return revenueChart.map((d, i) => (
                        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${d.period}: ${CURRENCY}${Number(d.revenue || 0).toLocaleString('en-IN')} (${d.orders} orders)`}>
                          <div className="w-full rounded-t bg-primary/80 transition-all hover:bg-primary" style={{ height: `${Math.max((Number(d.revenue || 0) / maxRev) * 100, 2)}%` }} />
                          <span className="text-[9px] text-muted-foreground">
                            {chartPeriod === '12months'
                              ? new Date(d.period + '-01').toLocaleDateString('en-IN', { month: 'short' })
                              : new Date(d.period).getDate()}
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Order Status */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-4 font-medium">Order Status</h3>
                <div className="flex flex-col gap-3">
                  {Object.entries(orderStatus).map(([status, count]) => {
                    const total = Object.values(orderStatus).reduce((s, c) => s + c, 0) || 1;
                    return (
                      <div key={status} className="flex items-center gap-3 text-sm">
                        <div className="flex w-24 items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: statusColors[status] || '#999' }} />
                          <span className="capitalize">{status}</span>
                        </div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${(count / total) * 100}%`, background: statusColors[status] || '#999' }} />
                        </div>
                        <span className="w-8 text-right font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Top Products */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-4 font-medium">Top Selling Products</h3>
                {topProducts.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">No sales data yet</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {topProducts.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.quantity} sold</span>
                        </div>
                        <span className="text-sm font-semibold">{CURRENCY}{Number(p.revenue || 0).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Orders + Payment Methods */}
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-4 font-medium">Recent Orders</h3>
                <div className="flex flex-col divide-y divide-border">
                  {recentOrders.slice(0, 7).map((o) => (
                    <div key={o.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="flex flex-col">
                        <span className="font-medium">{o.orderNumber}</span>
                        <span className="text-xs text-muted-foreground">{o.User?.name || o.guestEmail || 'Guest'}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-medium">{CURRENCY}{Number(o.totalAmount || 0).toLocaleString('en-IN')}</span>
                        <span className="text-xs capitalize text-muted-foreground">{o.paymentStatus}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {paymentMethods.length > 0 && (
                  <>
                    <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment Methods</h4>
                    <div className="mt-2 flex flex-col gap-1.5 text-sm">
                      {paymentMethods.map((pm) => (
                        <div key={pm.method} className="flex justify-between">
                          <span className="capitalize">{pm.method}</span>
                          <span className="text-muted-foreground">{pm.count} orders · {CURRENCY}{Number(pm.revenue || 0).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Inventory Alerts */}
            {lowStockProducts.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="mb-4 font-medium">Inventory Alerts ({lowStockProducts.length})</h3>
                <div className="mb-4 flex flex-wrap gap-2">
                  {dashboard.products.outOfStock > 0 && (
                    <span className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive"><strong>{dashboard.products.outOfStock}</strong> out of stock</span>
                  )}
                  {dashboard.products.lowStock > 0 && (
                    <span className="rounded-md bg-amber-500/10 px-3 py-1.5 text-sm text-amber-700 dark:text-amber-400"><strong>{dashboard.products.lowStock}</strong> low stock (≤5)</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {lowStockProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.category}</span>
                      </div>
                      <span className={cn('w-16 text-right text-sm font-bold', p.stock === 0 ? 'text-destructive' : 'text-amber-600')}>
                        {p.stock === 0 ? 'Out' : `${p.stock} left`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'products' && (
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
              <Button variant="outline" size="sm" onClick={() => window.open('/api/bulk-products/template?style=full', '_blank')} title="Full template with variants, Arabic and per-location stock">Template (full)</Button>
              <Button variant="outline" size="sm" onClick={() => window.open('/api/bulk-products/template?style=simple', '_blank')} title="Single-row legacy template — no variants, no Arabic">Template (simple)</Button>
            </div>

            <div className="mb-4">
              <Input
                type="search"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search by name, code, category, or brand"
                className="max-w-md"
              />
            </div>

            <Dialog open={showForm} onOpenChange={(o) => { if (!o) setShowForm(false); }}>
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex flex-col gap-2">
                      <Label>Price</Label>
                      <Input type="number" step={PRICE_STEP} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Compare Price</Label>
                      <Input type="number" step={PRICE_STEP} value={form.comparePrice} onChange={(e) => setForm({ ...form, comparePrice: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Cost Price</Label>
                      <Input type="number" step="0.001" value={form.costPrice || ''} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Stock</Label>
                      <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-2">
                      <Label>Brand</Label>
                      <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Product Code</Label>
                      <Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Internal code (optional)" />
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
                      <TableCell>{CURRENCY}{parseFloat(p.price).toFixed(2)}</TableCell>
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
                                taxable: !!p.taxable,
                                taxRate: parseFloat(p.taxRate) || 0,
                                hsnCode: p.hsnCode || '',
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
        )}

        {tab === 'orders' && (
          <div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Refund</TableHead>
                    <TableHead>Shipping</TableHead>
                    <TableHead>Invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.orderNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>{CURRENCY}{parseFloat(o.totalAmount).toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{o.paymentStatus}</TableCell>
                      <TableCell>
                        <Select value={o.orderStatus} onValueChange={(v) => handleStatusChange(o.id, v)}>
                          <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['processing', 'confirmed', 'shipped', 'delivered', 'cancelled'].map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {o.refundStatus === 'pending' ? (
                          <div className="flex gap-1">
                            <Button size="icon-sm" variant="ghost" className="text-emerald-600"
                              onClick={async () => {
                                await api.post(`/orders/${o.id}/refund`, { refundAmount: o.totalAmount });
                                toast.success('Refund processed');
                                api.get('/orders/all?limit=50').then((res) => setOrders(res.data.orders));
                              }}><Check className="size-4" /></Button>
                            <Button size="icon-sm" variant="ghost" className="text-destructive"
                              onClick={async () => {
                                await api.post(`/orders/${o.id}/refund-reject`);
                                toast.success('Refund rejected');
                                api.get('/orders/all?limit=50').then((res) => setOrders(res.data.orders));
                              }}><X className="size-4" /></Button>
                          </div>
                        ) : o.refundStatus === 'processed' ? (
                          <span className="text-xs font-semibold text-emerald-600">Done</span>
                        ) : o.refundStatus === 'failed' ? (
                          <span className="text-xs font-semibold text-destructive">Rejected</span>
                        ) : o.paymentStatus === 'paid' ? (
                          <Button size="sm" variant="outline"
                            onClick={async () => {
                              if (!confirm(`Refund ${CURRENCY}${parseFloat(o.totalAmount).toFixed(2)}?`)) return;
                              await api.post(`/orders/${o.id}/refund`, { refundAmount: o.totalAmount });
                              toast.success('Refund processed');
                              api.get('/orders/all?limit=50').then((res) => setOrders(res.data.orders));
                            }}>Refund</Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {o.shippingMeta?.awb ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-xs text-muted-foreground">{o.shippingMeta.courierName || '—'}</span>
                            <span className="font-mono text-xs">{o.shippingMeta.awb}</span>
                            <Button size="sm" variant="outline" onClick={() => setShipModal(o)}>Manage</Button>
                          </div>
                        ) : o.shippingMeta?.shipmentId ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-xs text-amber-600">AWB pending</span>
                            <Button size="sm" variant="outline" onClick={() => setShipModal(o)}>Manage</Button>
                          </div>
                        ) : o.shippingMeta?.lastError ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <span className="text-xs text-destructive" title={o.shippingMeta.lastError}>Failed</span>
                            <Button size="sm" variant="outline" onClick={() => setShipModal(o)}>Retry</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setShipModal(o)}>Ship</Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => window.open(`/api/orders/${o.id}/invoice`, '_blank')}>PDF</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Dialog open={!!shipModal} onOpenChange={(o) => { if (!o) setShipModal(null); }}>
              {shipModal && (
                <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Shipping — {shipModal.orderNumber}</DialogTitle></DialogHeader>

                  <div className="rounded-md bg-secondary/50 p-4 text-sm leading-relaxed">
                    {shipModal.shippingMeta?.awb ? (
                      <>
                        <div><strong>AWB:</strong> <span className="font-mono">{shipModal.shippingMeta.awb}</span></div>
                        <div><strong>Courier:</strong> {shipModal.shippingMeta.courierName} (#{shipModal.shippingMeta.courierId})</div>
                        <div><strong>Status:</strong> {shipModal.shippingMeta.currentStatus || 'AWB_ASSIGNED'}</div>
                        {shipModal.shippingMeta.pickupScheduledDate && <div><strong>Pickup:</strong> {shipModal.shippingMeta.pickupScheduledDate}</div>}
                        {shipModal.shippingMeta.etd && <div><strong>ETD:</strong> {shipModal.shippingMeta.etd}</div>}
                      </>
                    ) : shipModal.shippingMeta?.shipmentId ? (
                      <>
                        <div><strong>SR Order:</strong> {shipModal.shippingMeta.srOrderId}</div>
                        <div><strong>Shipment:</strong> {shipModal.shippingMeta.shipmentId}</div>
                        <div className="text-amber-600">AWB not yet assigned. Use &quot;Retry AWB&quot; to attempt.</div>
                      </>
                    ) : shipModal.shippingMeta?.lastError ? (
                      <div className="text-destructive"><strong>Last error:</strong> {shipModal.shippingMeta.lastError}</div>
                    ) : (
                      <div className="text-muted-foreground">No shipment yet.</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(!shipModal.shippingMeta?.awb) && (
                      <Button type="button" disabled={shipBusy}
                        onClick={async () => {
                          setShipBusy(true);
                          try {
                            const { data } = await api.post(`/shipping/orders/${shipModal.id}/create`);
                            toast.success(data.message || 'Shipment created');
                            const fresh = await api.get('/orders/all?limit=50');
                            setOrders(fresh.data.orders);
                            setShipModal(fresh.data.orders.find((o) => o.id === shipModal.id) || null);
                          } catch (err) { toast.error(err.response?.data?.message || 'Failed'); } finally { setShipBusy(false); }
                        }}>
                        {shipModal.shippingMeta?.shipmentId ? 'Retry AWB' : 'Create shipment'}
                      </Button>
                    )}
                    {shipModal.shippingMeta?.shipmentId && (
                      <>
                        <Button type="button" variant="outline" disabled={shipBusy}
                          onClick={async () => { setShipBusy(true); try { const { data } = await api.get(`/shipping/orders/${shipModal.id}/label`); window.open(data.url, '_blank'); } catch (err) { toast.error(err.response?.data?.message || 'Label unavailable'); } finally { setShipBusy(false); } }}>Label</Button>
                        <Button type="button" variant="outline" disabled={shipBusy}
                          onClick={async () => { setShipBusy(true); try { const { data } = await api.get(`/shipping/orders/${shipModal.id}/invoice`); window.open(data.url, '_blank'); } catch (err) { toast.error(err.response?.data?.message || 'Invoice unavailable'); } finally { setShipBusy(false); } }}>Invoice</Button>
                        <Button type="button" variant="outline" disabled={shipBusy}
                          onClick={async () => { setShipBusy(true); try { const { data } = await api.get(`/shipping/orders/${shipModal.id}/manifest`); window.open(data.url, '_blank'); } catch (err) { toast.error(err.response?.data?.message || 'Manifest unavailable'); } finally { setShipBusy(false); } }}>Manifest</Button>
                        <Button type="button" variant="outline" disabled={shipBusy}
                          onClick={async () => { setShipBusy(true); try { await api.post(`/shipping/orders/${shipModal.id}/refresh`); toast.success('Tracking refreshed'); const fresh = await api.get('/orders/all?limit=50'); setOrders(fresh.data.orders); setShipModal(fresh.data.orders.find((o) => o.id === shipModal.id) || null); } catch (err) { toast.error(err.response?.data?.message || 'Failed'); } finally { setShipBusy(false); } }}>Refresh tracking</Button>
                        <Button type="button" variant="ghost" className="ml-auto text-destructive" disabled={shipBusy}
                          onClick={async () => { if (!confirm('Cancel this shipment? The order itself will not be cancelled.')) return; setShipBusy(true); try { await api.post(`/shipping/orders/${shipModal.id}/cancel`); toast.success('Shipment cancelled'); const fresh = await api.get('/orders/all?limit=50'); setOrders(fresh.data.orders); setShipModal(null); } catch (err) { toast.error(err.response?.data?.message || 'Failed'); } finally { setShipBusy(false); } }}>Cancel shipment</Button>
                      </>
                    )}
                  </div>

                  {Array.isArray(shipModal.shippingMeta?.scans) && shipModal.shippingMeta.scans.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-sm text-muted-foreground">Tracking history ({shipModal.shippingMeta.scans.length} scans)</summary>
                      <div className="mt-2 max-h-60 overflow-y-auto text-xs leading-relaxed">
                        {shipModal.shippingMeta.scans.slice().reverse().map((s, i) => (
                          <div key={i} className="border-b border-border px-2 py-2">
                            <div><strong>{s.srStatusLabel || s.status}</strong> · {s.date}</div>
                            <div className="text-muted-foreground">{s.activity} — {s.location}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}

                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setShipModal(null)}>Close</Button>
                  </DialogFooter>
                </DialogContent>
              )}
            </Dialog>
          </div>
        )}

        {tab === 'b2bquotes' && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status:</label>
              <select
                value={b2bStatusFilter}
                onChange={(e) => setB2bStatusFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', background: 'var(--bg-warm)' }}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="quoted">Quoted</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-light)' }}>{b2bQuotes.length} request{b2bQuotes.length === 1 ? '' : 's'}</span>
            </div>

            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Request #</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Company</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {b2bQuotes.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No requests</td></tr>
                  )}
                  {b2bQuotes.map((q) => (
                    <tr key={q.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{q.requestNumber}</td>
                      <td>{new Date(q.createdAt).toLocaleDateString()}</td>
                      <td>{q.User?.name || '—'}<br /><span style={{ fontSize: '0.72rem', color: 'var(--text-light)' }}>{q.User?.email}</span></td>
                      <td>{q.companyName}</td>
                      <td>{Array.isArray(q.items) ? q.items.length : 0}</td>
                      <td>{q.quotedTotal ? `${CURRENCY}${parseFloat(q.quotedTotal).toFixed(2)}` : '—'}</td>
                      <td><span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: q.status === 'paid' ? 'rgba(34,197,94,0.15)' : q.status === 'quoted' ? 'rgba(59,130,246,0.15)' : q.status === 'pending' ? 'rgba(250,204,21,0.18)' : 'rgba(148,163,184,0.15)', color: q.status === 'paid' ? '#15803d' : q.status === 'quoted' ? '#1d4ed8' : q.status === 'pending' ? '#a16207' : '#475569' }}>{q.status}</span></td>
                      <td>
                        <button className="invoice-btn" onClick={() => {
                          // Prefill form with items priced from request; if a row has no unitPrice yet, leave it blank
                          const items = (q.items || []).map((it) => ({
                            productId: it.productId || null,
                            name: it.name,
                            quantity: parseInt(it.quantity, 10) || 1,
                            unitPrice: it.unitPrice != null ? it.unitPrice : '',
                            image: it.image || null,
                            category: it.category || null,
                          }));
                          setB2bQuoteForm({
                            ...q,
                            items,
                            quotedTotal: q.quotedTotal || '',
                            quotedValidUntil: q.quotedValidUntil ? q.quotedValidUntil.slice(0, 10) : '',
                            adminNote: q.adminNote || '',
                            internalNote: q.internalNote || '',
                            paymentMethod: q.paymentMethod || 'online',
                          });
                        }}>Open</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {b2bQuoteForm && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setB2bQuoteForm(null); }}>
                <div className="admin-form" style={{ maxWidth: 760 }}>
                  <h3 style={{ marginBottom: '0.5rem' }}>Quote {b2bQuoteForm.requestNumber}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                    <strong>{b2bQuoteForm.User?.name}</strong> ({b2bQuoteForm.User?.email})
                    {b2bQuoteForm.contactPhone && <> · {b2bQuoteForm.contactPhone}</>}
                    <br />
                    {b2bQuoteForm.companyName}
                    <br />
                    {[
                      b2bQuoteForm.contactAddress?.line1,
                      b2bQuoteForm.contactAddress?.line2,
                      b2bQuoteForm.contactAddress?.city,
                      b2bQuoteForm.contactAddress?.state,
                      b2bQuoteForm.contactAddress?.postalCode,
                    ].filter(Boolean).join(', ')}
                  </p>

                  {b2bQuoteForm.customerNote && (
                    <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-warm)', borderRadius: 'var(--radius)', marginBottom: '1rem', fontSize: '0.85rem', borderLeft: '3px solid var(--copper)' }}>
                      <strong style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Customer note:</strong>
                      <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.25rem' }}>{b2bQuoteForm.customerNote}</div>
                    </div>
                  )}

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item</th>
                        <th style={{ width: 80, padding: '0.5rem' }}>Qty</th>
                        <th style={{ width: 130, padding: '0.5rem' }}>Unit price</th>
                        <th style={{ width: 110, padding: '0.5rem', textAlign: 'right' }}>Line total</th>
                        <th style={{ width: 30 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {b2bQuoteForm.items.map((it, idx) => {
                        const lineTotal = (parseFloat(it.unitPrice) || 0) * (parseInt(it.quantity, 10) || 0);
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <input
                                value={it.name}
                                onChange={(e) => {
                                  const items = [...b2bQuoteForm.items];
                                  items[idx] = { ...items[idx], name: e.target.value };
                                  setB2bQuoteForm({ ...b2bQuoteForm, items });
                                }}
                                style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--bg-warm)' }}
                              />
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <input
                                type="number"
                                value={it.quantity}
                                min={1}
                                onChange={(e) => {
                                  const items = [...b2bQuoteForm.items];
                                  items[idx] = { ...items[idx], quantity: e.target.value };
                                  setB2bQuoteForm({ ...b2bQuoteForm, items });
                                }}
                                style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--bg-warm)' }}
                              />
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <input
                                type="number"
                                step="0.01"
                                value={it.unitPrice}
                                placeholder="0.00"
                                onChange={(e) => {
                                  const items = [...b2bQuoteForm.items];
                                  items[idx] = { ...items[idx], unitPrice: e.target.value };
                                  setB2bQuoteForm({ ...b2bQuoteForm, items });
                                }}
                                style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--bg-warm)' }}
                              />
                            </td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{CURRENCY}{lineTotal.toFixed(2)}</td>
                            <td>
                              <button type="button" onClick={() => setB2bQuoteForm({ ...b2bQuoteForm, items: b2bQuoteForm.items.filter((_, j) => j !== idx) })}
                                style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                                <HiX />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <button type="button" onClick={() => setB2bQuoteForm({ ...b2bQuoteForm, items: [...b2bQuoteForm.items, { productId: null, name: '', quantity: 1, unitPrice: '' }] })}
                    className="btn btn-secondary" style={{ fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    <HiPlus /> Add item
                  </button>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Quoted total</label>
                      <input
                        type="number"
                        step="0.01"
                        value={b2bQuoteForm.quotedTotal}
                        onChange={(e) => setB2bQuoteForm({ ...b2bQuoteForm, quotedTotal: e.target.value })}
                        placeholder={
                          b2bQuoteForm.items.reduce((s, i) => s + ((parseFloat(i.unitPrice) || 0) * (parseInt(i.quantity, 10) || 0)), 0).toFixed(2)
                        }
                      />
                      <small style={{ color: 'var(--text-light)' }}>Override the auto-sum if needed (eg discount baked in).</small>
                    </div>
                    <div className="form-group">
                      <label>Valid until</label>
                      <input
                        type="date"
                        value={b2bQuoteForm.quotedValidUntil}
                        onChange={(e) => setB2bQuoteForm({ ...b2bQuoteForm, quotedValidUntil: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Payment method</label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}>
                        <input type="radio" name="paymentMethod" value="online" checked={b2bQuoteForm.paymentMethod === 'online'}
                          onChange={() => setB2bQuoteForm({ ...b2bQuoteForm, paymentMethod: 'online' })} />
                        Online (payment gateway)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem' }}>
                        <input type="radio" name="paymentMethod" value="bank_transfer" checked={b2bQuoteForm.paymentMethod === 'bank_transfer'}
                          onChange={() => setB2bQuoteForm({ ...b2bQuoteForm, paymentMethod: 'bank_transfer' })} />
                        Bank transfer
                      </label>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Note to customer (shown in quote email)</label>
                    <textarea rows={3} value={b2bQuoteForm.adminNote} onChange={(e) => setB2bQuoteForm({ ...b2bQuoteForm, adminNote: e.target.value })} />
                  </div>

                  <div className="form-group">
                    <label>Internal note (admin-only)</label>
                    <textarea rows={2} value={b2bQuoteForm.internalNote} onChange={(e) => setB2bQuoteForm({ ...b2bQuoteForm, internalNote: e.target.value })} />
                  </div>

                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={b2bQuoteForm.status}
                      onChange={async (e) => {
                        const next = e.target.value;
                        if (next === 'paid' && b2bQuoteForm.status !== 'paid') {
                          toast.error('Use "Mark Paid" to record payment.');
                          return;
                        }
                        try {
                          await api.patch(`/b2b/requests/${b2bQuoteForm.id}/status`, { status: next });
                          setB2bQuoteForm({ ...b2bQuoteForm, status: next });
                          const qs = b2bStatusFilter ? `?status=${b2bStatusFilter}` : '';
                          api.get(`/b2b/requests${qs}`).then((res) => setB2bQuotes(res.data));
                          toast.success('Status updated');
                        } catch (err) {
                          toast.error(err.response?.data?.message || 'Failed');
                        }
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="quoted">Quoted</option>
                      <option value="paid" disabled={b2bQuoteForm.status !== 'paid'}>Paid</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                    <button type="button" className="btn btn-primary"
                      onClick={async () => {
                        try {
                          const payload = {
                            items: b2bQuoteForm.items.map((i) => ({
                              productId: i.productId || null,
                              name: i.name,
                              quantity: parseInt(i.quantity, 10),
                              unitPrice: parseFloat(i.unitPrice) || 0,
                              lineTotal: (parseFloat(i.unitPrice) || 0) * (parseInt(i.quantity, 10) || 0),
                              image: i.image || null,
                              category: i.category || null,
                            })),
                            quotedTotal: parseFloat(b2bQuoteForm.quotedTotal) || b2bQuoteForm.items.reduce((s, i) => s + ((parseFloat(i.unitPrice) || 0) * (parseInt(i.quantity, 10) || 0)), 0),
                            quotedValidUntil: b2bQuoteForm.quotedValidUntil || null,
                            adminNote: b2bQuoteForm.adminNote,
                            internalNote: b2bQuoteForm.internalNote,
                            paymentMethod: b2bQuoteForm.paymentMethod,
                            sendEmail: true,
                          };
                          await api.patch(`/b2b/requests/${b2bQuoteForm.id}/quote`, payload);
                          toast.success('Quote sent');
                          setB2bQuoteForm(null);
                          const qs = b2bStatusFilter ? `?status=${b2bStatusFilter}` : '';
                          api.get(`/b2b/requests${qs}`).then((res) => setB2bQuotes(res.data));
                        } catch (err) {
                          toast.error(err.response?.data?.message || 'Failed');
                        }
                      }}>Send Quote</button>

                    {b2bQuoteForm.paymentMethod === 'bank_transfer' && b2bQuoteForm.status === 'quoted' && (
                      <button type="button" className="btn btn-secondary"
                        onClick={async () => {
                          if (!confirm('Mark this bank transfer as paid? This creates the order.')) return;
                          try {
                            await api.patch(`/b2b/requests/${b2bQuoteForm.id}/mark-paid`);
                            toast.success('Marked as paid — order created');
                            setB2bQuoteForm(null);
                            const qs = b2bStatusFilter ? `?status=${b2bStatusFilter}` : '';
                            api.get(`/b2b/requests${qs}`).then((res) => setB2bQuotes(res.data));
                          } catch (err) {
                            toast.error(err.response?.data?.message || 'Failed');
                          }
                        }}>Mark Paid</button>
                    )}

                    <button type="button" className="btn btn-secondary" onClick={() => setB2bQuoteForm(null)} style={{ marginLeft: 'auto' }}>Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'locations' && (
          <div>
            <button
              className="btn btn-primary"
              onClick={() => setLocationForm({ name: '', code: '', type: 'store', address: '', phone: '', isOnlineDefault: false, sortOrder: 0, _editing: false })}
              style={{ marginBottom: '1.5rem' }}
            >
              <HiPlus /> Add Location
            </button>

            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Address</th>
                    <th>Online default</th>
                    <th>Active</th>
                    <th>Edit</th>
                    <th>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No locations yet — add your first store</td></tr>
                  )}
                  {locations.map((l) => (
                    <tr key={l.id}>
                      <td><strong>{l.name}</strong></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{l.code || '—'}</td>
                      <td>{l.type}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: 280 }}>{l.address || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {l.isOnlineDefault ? <span style={{ color: 'var(--success)' }}>✓ default</span> : (
                          <button className="invoice-btn" style={{ fontSize: '0.7rem' }}
                            onClick={async () => {
                              try {
                                await api.post(`/locations/${l.id}/set-online-default`);
                                api.get('/locations').then((res) => setLocations(res.data));
                                toast.success('Marked as online default');
                              } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                            }}>Set</button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>{l.active ? '✓' : '—'}</td>
                      <td>
                        <button className="icon-btn" onClick={() => setLocationForm({ ...l, _editing: true })}><HiPencil /></button>
                      </td>
                      <td>
                        <button className="icon-btn danger" onClick={async () => {
                          if (!confirm(`Delete "${l.name}"?`)) return;
                          try {
                            await api.delete(`/locations/${l.id}`);
                            setLocations(locations.filter((x) => x.id !== l.id));
                            toast.success('Deleted');
                          } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                        }}><HiTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {locationForm && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setLocationForm(null); }}>
                <form className="admin-form" onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    if (locationForm._editing) {
                      await api.patch(`/locations/${locationForm.id}`, locationForm);
                      toast.success('Location updated');
                    } else {
                      await api.post('/locations', locationForm);
                      toast.success('Location created');
                    }
                    setLocationForm(null);
                    api.get('/locations').then((res) => setLocations(res.data));
                  } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                }}>
                  <h3>{locationForm._editing ? 'Edit Location' : 'New Location'}</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name</label>
                      <input value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Code (short, for receipts)</label>
                      <input value={locationForm.code || ''} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })} placeholder="YAAL" maxLength={20} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Type</label>
                      <select value={locationForm.type} onChange={(e) => setLocationForm({ ...locationForm, type: e.target.value })}>
                        <option value="store">Store</option>
                        <option value="warehouse">Warehouse</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Sort order</label>
                      <input type="number" value={locationForm.sortOrder || 0} onChange={(e) => setLocationForm({ ...locationForm, sortOrder: parseInt(e.target.value, 10) || 0 })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <input value={locationForm.address || ''} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input value={locationForm.phone || ''} onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="checkbox" checked={!!locationForm.isOnlineDefault} onChange={(e) => setLocationForm({ ...locationForm, isOnlineDefault: e.target.checked })} />
                      Online fulfilment default — online orders decrement this location's stock
                    </label>
                  </div>
                  {locationForm._editing && (
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" checked={!!locationForm.active} onChange={(e) => setLocationForm({ ...locationForm, active: e.target.checked })} />
                        Active
                      </label>
                    </div>
                  )}
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">{locationForm._editing ? 'Save' : 'Create'}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setLocationForm(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {tab === 'inventory' && (
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="search"
                placeholder="Search products to view per-location stock"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                style={{ flex: 1, minWidth: 240, padding: '0.55rem 0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>{locations.length} location{locations.length === 1 ? '' : 's'}</span>
            </div>

            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Code</th>
                    <th>Variants</th>
                    <th>Total stock</th>
                    <th>Per location</th>
                  </tr>
                </thead>
                <tbody>
                  {products
                    .filter((p) => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code?.toLowerCase().includes(productSearch.toLowerCase()))
                    .slice(0, 100)
                    .map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.code || `P${p.id}`}</td>
                        <td style={{ textAlign: 'center' }}>{Array.isArray(p.variants) ? p.variants.length : '—'}</td>
                        <td><strong>{p.stock}</strong></td>
                        <td>
                          <button className="invoice-btn" onClick={async () => {
                            try {
                              setInvProductId(p.id);
                              const { data } = await api.get(`/inventory/product/${p.id}`);
                              setInvDetail(data);
                              // Seed the draft with existing values so the inputs are controlled.
                              const draft = {};
                              const variantRows = Array.isArray(data.product.variants) && data.product.variants.length > 0
                                ? data.product.variants.map((_, idx) => idx)
                                : [null];
                              for (const vIdx of variantRows) {
                                for (const loc of data.locations) {
                                  const existing = data.stocks.find((s) =>
                                    s.locationId === loc.id &&
                                    (s.variantIndex === vIdx || (s.variantIndex == null && vIdx == null))
                                  );
                                  draft[`${vIdx ?? 'b'}:${loc.id}`] = String(existing?.quantity ?? 0);
                                }
                              }
                              setInvDraft(draft);
                            } catch (err) { toast.error(err.response?.data?.message || 'Failed to load'); }
                          }}>Open</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {invProductId && invDetail && (() => {
              const variantRows = Array.isArray(invDetail.product.variants) && invDetail.product.variants.length > 0
                ? invDetail.product.variants.map((v, idx) => ({ idx, label: Object.values(v.options || {}).join(' / ') || `Variant ${idx + 1}` }))
                : [{ idx: null, label: '— (no variants)' }];
              // Build the diff between draft and persisted stocks so the Save button knows what to send.
              const changes = [];
              for (const row of variantRows) {
                for (const l of invDetail.locations) {
                  const k = `${row.idx ?? 'b'}:${l.id}`;
                  const draftVal = invDraft[k];
                  if (draftVal === undefined) continue;
                  const existing = invDetail.stocks.find((s) =>
                    s.locationId === l.id &&
                    (s.variantIndex === row.idx || (s.variantIndex == null && row.idx == null))
                  );
                  const oldQty = existing?.quantity ?? 0;
                  const newQty = parseInt(draftVal, 10);
                  if (!isNaN(newQty) && newQty !== oldQty && newQty >= 0) {
                    changes.push({ productId: invDetail.product.id, variantIndex: row.idx, locationId: l.id, quantity: newQty });
                  }
                }
              }
              const closeModal = () => { setInvProductId(null); setInvDetail(null); setInvDraft({}); };
              return (
                <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                  <div className="admin-form" style={{ maxWidth: 720 }}>
                    <h3>Stock — {invDetail.product.name}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Total: <strong>{invDetail.product.stock}</strong> across {invDetail.locations.length} location{invDetail.locations.length === 1 ? '' : 's'}
                      {changes.length > 0 && <> · <span style={{ color: 'var(--copper, #c4784a)' }}>{changes.length} unsaved change{changes.length === 1 ? '' : 's'}</span></>}
                    </p>

                    {invDetail.locations.length === 0 ? (
                      <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)' }}>
                        No active locations. Create at least one in the <button type="button" className="invoice-btn" onClick={() => { closeModal(); setTab('locations'); }}>Locations</button> tab first.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left' }}>Variant</th>
                            {invDetail.locations.map((l) => (
                              <th key={l.id} style={{ padding: '0.5rem', textAlign: 'center', minWidth: 100 }}>{l.name}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {variantRows.map((row) => (
                            <tr key={row.idx ?? 'base'} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ padding: '0.5rem' }}>{row.label}</td>
                              {invDetail.locations.map((l) => {
                                const k = `${row.idx ?? 'b'}:${l.id}`;
                                const existing = invDetail.stocks.find((s) =>
                                  s.locationId === l.id &&
                                  (s.variantIndex === row.idx || (s.variantIndex == null && row.idx == null))
                                );
                                const oldQty = existing?.quantity ?? 0;
                                const currentDraft = invDraft[k] ?? String(oldQty);
                                const dirty = parseInt(currentDraft, 10) !== oldQty && currentDraft !== '';
                                return (
                                  <td key={l.id} style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    <input
                                      type="number"
                                      min={0}
                                      value={currentDraft}
                                      disabled={invBusy}
                                      onChange={(e) => setInvDraft({ ...invDraft, [k]: e.target.value })}
                                      style={{
                                        width: 70, padding: '0.3rem 0.4rem',
                                        border: `1px solid ${dirty ? 'var(--copper, #c4784a)' : 'var(--border)'}`,
                                        borderRadius: 4, textAlign: 'center',
                                        background: dirty ? 'rgba(196, 120, 74, 0.06)' : 'transparent',
                                      }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <div className="form-actions" style={{ marginTop: '1.25rem' }}>
                      <button type="button" className="btn btn-primary" disabled={invBusy || changes.length === 0}
                        onClick={async () => {
                          setInvBusy(true);
                          try {
                            await api.post('/inventory/adjust-bulk', { items: changes });
                            toast.success(`Saved ${changes.length} change${changes.length === 1 ? '' : 's'}`);
                            const { data } = await api.get(`/inventory/product/${invDetail.product.id}`);
                            setInvDetail(data);
                            setInvDraft({});
                            api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
                          } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                          finally { setInvBusy(false); }
                        }}>
                        {invBusy ? 'Saving…' : `Save ${changes.length || ''} changes`.trim()}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={closeModal}>Close</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === 'transfers' && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
              <button className="btn btn-primary"
                onClick={() => setTransferForm({ fromLocationId: '', toLocationId: '', items: [], notes: '' })}>
                <HiPlus /> New Transfer
              </button>
              <label style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Status:</label>
              <select value={transferStatusFilter} onChange={(e) => setTransferStatusFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="in_transit">In transit</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-light)' }}>{transfers.length} transfer{transfers.length === 1 ? '' : 's'}</span>
            </div>

            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Transfer #</th>
                    <th>From → To</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No transfers</td></tr>}
                  {transfers.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{t.transferNumber}</td>
                      <td>{t.fromLocation?.name} → {t.toLocation?.name}</td>
                      <td>{Array.isArray(t.items) ? t.items.length : 0}</td>
                      <td>
                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: 4,
                          background: t.status === 'completed' ? 'rgba(34,197,94,0.15)' : t.status === 'in_transit' ? 'rgba(59,130,246,0.15)' : t.status === 'pending' ? 'rgba(250,204,21,0.18)' : 'rgba(148,163,184,0.15)',
                          color: t.status === 'completed' ? '#15803d' : t.status === 'in_transit' ? '#1d4ed8' : t.status === 'pending' ? '#a16207' : '#475569' }}>{t.status}</span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td>
                        {t.status === 'pending' && (
                          <button className="invoice-btn" style={{ fontSize: '0.7rem' }} onClick={async () => {
                            try {
                              await api.post(`/stock-transfers/${t.id}/dispatch`);
                              toast.success('Dispatched — source decremented');
                              const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                              api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                            } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                          }}>Dispatch</button>
                        )}
                        {t.status === 'in_transit' && (
                          <button className="invoice-btn" style={{ fontSize: '0.7rem' }} onClick={async () => {
                            try {
                              await api.post(`/stock-transfers/${t.id}/complete`);
                              toast.success('Completed — destination incremented');
                              const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                              api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                            } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                          }}>Complete</button>
                        )}
                        {(t.status === 'pending' || t.status === 'in_transit') && (
                          <button className="icon-btn danger" style={{ fontSize: '0.7rem', marginLeft: '0.3rem' }} title="Cancel" onClick={async () => {
                            if (!confirm(`Cancel transfer ${t.transferNumber}?`)) return;
                            try {
                              await api.post(`/stock-transfers/${t.id}/cancel`);
                              toast.success('Cancelled');
                              const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                              api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                            } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                          }}><HiX /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {transferForm && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setTransferForm(null); }}>
                <div className="admin-form" style={{ maxWidth: 720 }}>
                  <h3>New Stock Transfer</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>From</label>
                      <select value={transferForm.fromLocationId} onChange={(e) => setTransferForm({ ...transferForm, fromLocationId: e.target.value })} required>
                        <option value="">Select…</option>
                        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>To</label>
                      <select value={transferForm.toLocationId} onChange={(e) => setTransferForm({ ...transferForm, toLocationId: e.target.value })} required>
                        <option value="">Select…</option>
                        {locations.filter((l) => String(l.id) !== String(transferForm.fromLocationId)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Items</label>
                    {transferForm.items.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>No items yet — add below.</p>}
                    {transferForm.items.map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem', alignItems: 'center' }}>
                        <select
                          value={it.productId || ''}
                          onChange={(e) => {
                            const p = products.find((x) => x.id === parseInt(e.target.value, 10));
                            const items = [...transferForm.items];
                            items[idx] = { ...items[idx], productId: parseInt(e.target.value, 10), name: p?.name, variantIndex: null };
                            setTransferForm({ ...transferForm, items });
                          }}
                          style={{ flex: 1, padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
                        >
                          <option value="">Pick product…</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {(() => {
                          const p = products.find((x) => x.id === it.productId);
                          if (!p || !Array.isArray(p.variants) || p.variants.length === 0) return null;
                          return (
                            <select
                              value={it.variantIndex ?? ''}
                              onChange={(e) => {
                                const items = [...transferForm.items];
                                items[idx] = { ...items[idx], variantIndex: e.target.value === '' ? null : parseInt(e.target.value, 10) };
                                setTransferForm({ ...transferForm, items });
                              }}
                              style={{ width: 140, padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: 4 }}
                            >
                              <option value="">All variants</option>
                              {p.variants.map((v, i) => <option key={i} value={i}>{Object.values(v.options || {}).join('/')}</option>)}
                            </select>
                          );
                        })()}
                        <input type="number" min={1} value={it.quantity || ''} placeholder="Qty"
                          onChange={(e) => {
                            const items = [...transferForm.items];
                            items[idx] = { ...items[idx], quantity: parseInt(e.target.value, 10) || 0 };
                            setTransferForm({ ...transferForm, items });
                          }}
                          style={{ width: 80, padding: '0.4rem 0.5rem', border: '1px solid var(--border)', borderRadius: 4 }} />
                        <button type="button" className="icon-btn danger" onClick={() => setTransferForm({ ...transferForm, items: transferForm.items.filter((_, i) => i !== idx) })}><HiX /></button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                      onClick={() => setTransferForm({ ...transferForm, items: [...transferForm.items, { productId: null, variantIndex: null, quantity: 1 }] })}>
                      <HiPlus /> Add item
                    </button>
                  </div>

                  <div className="form-group">
                    <label>Notes (optional)</label>
                    <textarea rows={2} value={transferForm.notes || ''} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} />
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn btn-primary" onClick={async () => {
                      try {
                        await api.post('/stock-transfers', transferForm);
                        toast.success('Transfer created (pending)');
                        setTransferForm(null);
                        const qs = transferStatusFilter ? `?status=${transferStatusFilter}` : '';
                        api.get(`/stock-transfers${qs}`).then((res) => setTransfers(res.data));
                      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                    }}>Create transfer</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setTransferForm(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'barcode-labels' && <BarcodeLabels currency={CURRENCY} />}

        {tab === 'cashiers' && (
          <div>
            <button
              className="btn btn-primary"
              onClick={() => setCashierForm({ name: '', email: '', password: '', pin: '', homeLocationId: '', role: 'cashier', _editing: false })}
              style={{ marginBottom: '1.5rem' }}
            >
              <HiPlus /> Add Cashier
            </button>

            <div className="admin-table" style={{ marginBottom: '2rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Home location</th>
                    <th>Created</th>
                    <th>Edit</th>
                    <th>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {cashiers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No cashier accounts yet</td></tr>}
                  {cashiers.map((u) => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{u.email}</td>
                      <td>{locations.find((l) => l.id === u.homeLocationId)?.name || '—'}</td>
                      <td style={{ fontSize: '0.78rem' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="icon-btn" onClick={() => setCashierForm({
                          ...u, password: '', pin: '', role: 'cashier', _editing: true, _id: u.id,
                        })}><HiPencil /></button>
                      </td>
                      <td>
                        <button className="icon-btn danger" onClick={async () => {
                          if (!confirm(`Delete cashier "${u.name}"?`)) return;
                          try {
                            await api.delete(`/staff/${u.id}`);
                            setCashiers(cashiers.filter((x) => x.id !== u.id));
                            toast.success('Deleted');
                          } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                        }}><HiTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ marginTop: '2rem', fontSize: '1rem', color: 'var(--text-secondary)' }}>Recent shifts</h3>
            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Cashier</th>
                    <th>Location</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Opening</th>
                    <th>Closing</th>
                    <th>Variance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No shifts yet</td></tr>}
                  {shifts.map((s) => (
                    <tr key={s.id}>
                      <td>{s.User?.name || `User #${s.userId}`}</td>
                      <td>{s.Location?.name || `Loc #${s.locationId}`}</td>
                      <td style={{ fontSize: '0.78rem' }}>{new Date(s.openedAt).toLocaleString()}</td>
                      <td style={{ fontSize: '0.78rem' }}>{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{CURRENCY}{parseFloat(s.openingCash).toFixed(3)}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.closingCash != null ? `${CURRENCY}${parseFloat(s.closingCash).toFixed(3)}` : '—'}</td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', color: s.cashVariance < 0 ? 'var(--danger)' : s.cashVariance > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {s.cashVariance != null ? `${s.cashVariance >= 0 ? '+' : ''}${parseFloat(s.cashVariance).toFixed(3)}` : '—'}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: 4,
                          background: s.status === 'open' ? 'rgba(34,197,94,0.18)' : 'rgba(148,163,184,0.15)',
                          color: s.status === 'open' ? '#15803d' : '#475569' }}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cashierForm && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setCashierForm(null); }}>
                <form className="admin-form" onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    if (cashierForm._editing) {
                      const payload = {
                        name: cashierForm.name,
                        homeLocationId: cashierForm.homeLocationId || null,
                        isManager: !!cashierForm.isManager,
                      };
                      if (cashierForm.password) payload.password = cashierForm.password;
                      if (cashierForm.pin) payload.pin = cashierForm.pin;
                      await api.put(`/staff/${cashierForm._id}`, payload);
                      toast.success('Cashier updated');
                    } else {
                      await api.post('/staff', {
                        name: cashierForm.name,
                        email: cashierForm.email,
                        password: cashierForm.password,
                        pin: cashierForm.pin,
                        homeLocationId: cashierForm.homeLocationId || null,
                        isManager: !!cashierForm.isManager,
                        role: 'cashier',
                      });
                      toast.success('Cashier account created');
                    }
                    setCashierForm(null);
                    api.get('/staff?role=cashier').then((r) => setCashiers(r.data)).catch(() => {});
                  } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                }}>
                  <h3>{cashierForm._editing ? 'Edit Cashier' : 'New Cashier'}</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Name</label>
                      <input value={cashierForm.name} onChange={(e) => setCashierForm({ ...cashierForm, name: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Email {cashierForm._editing && <small>(read-only)</small>}</label>
                      <input type="email" value={cashierForm.email} onChange={(e) => setCashierForm({ ...cashierForm, email: e.target.value })} required={!cashierForm._editing} disabled={cashierForm._editing} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>{cashierForm._editing ? 'New password (leave blank to keep)' : 'Password'}</label>
                      <input type="password" value={cashierForm.password} onChange={(e) => setCashierForm({ ...cashierForm, password: e.target.value })} required={!cashierForm._editing} minLength={8} />
                    </div>
                    <div className="form-group">
                      <label>{cashierForm._editing ? 'New PIN (leave blank to keep)' : 'PIN (4–6 digits)'}</label>
                      <input
                        type="text" inputMode="numeric" pattern="\d{4,6}"
                        value={cashierForm.pin}
                        onChange={(e) => setCashierForm({ ...cashierForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                        required={!cashierForm._editing}
                        placeholder="1234"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Home location (suggested at login)</label>
                    <select value={cashierForm.homeLocationId || ''} onChange={(e) => setCashierForm({ ...cashierForm, homeLocationId: e.target.value })}>
                      <option value="">— None —</option>
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="checkbox" checked={!!cashierForm.isManager} onChange={(e) => setCashierForm({ ...cashierForm, isManager: e.target.checked })} />
                      <span>Manager <small style={{ color: 'var(--text-light)' }}>(can approve POS overrides — large discounts, large refunds)</small></span>
                    </label>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">{cashierForm._editing ? 'Save' : 'Create'}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setCashierForm(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {tab === 'activity-log' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h2>Activity Log</h2>
              <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>{activityLog.length} entries</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
                <input type="date" value={activityFilter.from} onChange={(e) => setActivityFilter({ ...activityFilter, from: e.target.value })} /></div>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
                <input type="date" value={activityFilter.to} onChange={(e) => setActivityFilter({ ...activityFilter, to: e.target.value })} /></div>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Action</label>
                <select value={activityFilter.action} onChange={(e) => setActivityFilter({ ...activityFilter, action: e.target.value })}>
                  <option value="">All</option>
                  <option value="pos_sale">POS sale</option>
                  <option value="sales_return_create">Sales return</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={activityFilter.managerOnly} onChange={(e) => setActivityFilter({ ...activityFilter, managerOnly: e.target.checked })} />
                Manager overrides only
              </label>
              <button className="btn btn-secondary" onClick={() => setActivityFilter({ from: '', to: '', action: '', managerOnly: false })}>Clear</button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Location</th><th>Override</th><th>Reason</th><th></th></tr></thead>
                <tbody>
                  {activityLog.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No entries</td></tr>}
                  {activityLog.map((e) => (
                    <tr key={e.id} style={{ background: e.managerOverrideBy ? 'rgba(251,191,36,0.06)' : 'inherit' }}>
                      <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</td>
                      <td>{e.actor?.name || '—'} <small style={{ color: 'var(--text-light)' }}>({e.actor?.role})</small></td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{e.action}</td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {e.entityType && <span>{e.entityType}#{e.entityId}</span>}
                        {!e.entityType && '—'}
                      </td>
                      <td>{e.Location?.name || '—'}</td>
                      <td>{e.approver?.name ? <strong style={{ color: 'var(--copper)' }}>{e.approver.name}</strong> : '—'}</td>
                      <td style={{ fontSize: '0.82rem', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.reason || '—'}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={() => setActivityDetail(e)}>Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activityDetail && (
              <div className="admin-form-overlay" onClick={(ev) => { if (ev.target === ev.currentTarget) setActivityDetail(null); }}>
                <div className="admin-form" style={{ maxWidth: 560 }}>
                  <h3>Activity #{activityDetail.id}</h3>
                  <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    <div>When: {new Date(activityDetail.createdAt).toLocaleString()}</div>
                    <div>Actor: {activityDetail.actor?.name} ({activityDetail.actor?.role})</div>
                    <div>Action: <strong>{activityDetail.action}</strong></div>
                    {activityDetail.entityType && <div>Entity: {activityDetail.entityType}#{activityDetail.entityId}</div>}
                    {activityDetail.Location && <div>Location: {activityDetail.Location.name}</div>}
                    {activityDetail.approver && <div>Manager: <strong>{activityDetail.approver.name}</strong></div>}
                    {activityDetail.reason && <div>Reason: {activityDetail.reason}</div>}
                    {activityDetail.ip && <div>IP: {activityDetail.ip}</div>}
                  </div>
                  <pre style={{ background: 'var(--bg-warm, #f5f1e8)', padding: '0.75rem', borderRadius: 6, fontSize: '0.78rem', overflow: 'auto', maxHeight: 300 }}>
                    {JSON.stringify(activityDetail.details, null, 2)}
                  </pre>
                  <div className="form-actions" style={{ marginTop: '1rem' }}>
                    <button className="btn btn-primary" onClick={() => setActivityDetail(null)}>Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'pos-reports' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h2>POS Reports</h2>
            </div>

            <div className="report-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Group by</label>
                <select value={reportType} onChange={(e) => { setReportType(e.target.value); setReportData(null); }}>
                  <option value="cashier">Cashier</option>
                  <option value="location">Location</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
                <input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
                <input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Quick range</label>
                <select onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const today = new Date();
                  const iso = (d) => d.toISOString().slice(0, 10);
                  setReportTo(iso(today));
                  if (v === 'today') setReportFrom(iso(today));
                  if (v === '7d') { const d = new Date(today); d.setDate(d.getDate() - 6); setReportFrom(iso(d)); }
                  if (v === '30d') { const d = new Date(today); d.setDate(d.getDate() - 29); setReportFrom(iso(d)); }
                  if (v === 'mtd') setReportFrom(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
                  e.target.value = '';
                }}>
                  <option value="">— Pick —</option>
                  <option value="today">Today</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="mtd">Month to date</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
                <select value={reportFilterLocation} onChange={(e) => setReportFilterLocation(e.target.value)}>
                  <option value="">All</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              {reportType === 'cashier' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Cashier</label>
                  <select value={reportFilterCashier} onChange={(e) => setReportFilterCashier(e.target.value)}>
                    <option value="">All</option>
                    {cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <button
                className="btn btn-primary"
                disabled={reportLoading}
                onClick={async () => {
                  setReportLoading(true);
                  try {
                    const params = {
                      from: new Date(reportFrom + 'T00:00:00').toISOString(),
                      to: new Date(reportTo + 'T23:59:59.999').toISOString(),
                    };
                    if (reportFilterLocation) params.locationId = reportFilterLocation;
                    if (reportType === 'cashier' && reportFilterCashier) params.cashierId = reportFilterCashier;
                    const url = reportType === 'cashier' ? '/reports/cashier-sales' : '/reports/location-sales';
                    const { data } = await api.get(url, { params });
                    setReportData(data);
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed to load report');
                  } finally {
                    setReportLoading(false);
                  }
                }}>
                {reportLoading ? 'Loading…' : 'Run report'}
              </button>
              {reportData && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const rows = reportData.rows || [];
                    const headers = reportType === 'cashier'
                      ? ['Cashier', 'Orders', 'Cash', 'KNET', 'Card', 'Refunds', 'Net sales']
                      : ['Location', 'Orders', 'Cash', 'KNET', 'Card', 'Refunds', 'Net sales'];
                    const lines = [headers.join(',')];
                    for (const r of rows) {
                      const label = reportType === 'cashier' ? r.cashierName : r.locationName;
                      const refunds = ((r.cashRefunds || 0) + (r.cardRefunds || 0) + (r.knetRefunds || 0)).toFixed(3);
                      lines.push([`"${label}"`, r.orderCount, r.cashSales, r.knetSales || 0, r.cardSales, refunds, r.netSales].join(','));
                    }
                    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${reportType}-sales-${reportFrom}-to-${reportTo}.csv`;
                    a.click();
                  }}>
                  Export CSV
                </button>
              )}
            </div>

            {!reportData && !reportLoading && (
              <p style={{ color: 'var(--text-light)' }}>Choose filters and click <strong>Run report</strong>.</p>
            )}

            {reportData && (
              <>
                <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="dash-card">
                    <div className="dash-card-label">Total orders</div>
                    <div className="dash-card-value">{reportData.totals.orderCount}</div>
                  </div>
                  <div className="dash-card">
                    <div className="dash-card-label">Cash sales</div>
                    <div className="dash-card-value">{CURRENCY}{reportData.totals.cashSales.toFixed(3)}</div>
                  </div>
                  <div className="dash-card">
                    <div className="dash-card-label">KNET sales</div>
                    <div className="dash-card-value">{CURRENCY}{(reportData.totals.knetSales || 0).toFixed(3)}</div>
                  </div>
                  <div className="dash-card">
                    <div className="dash-card-label">Card sales</div>
                    <div className="dash-card-value">{CURRENCY}{reportData.totals.cardSales.toFixed(3)}</div>
                  </div>
                  <div className="dash-card">
                    <div className="dash-card-label">Net sales</div>
                    <div className="dash-card-value">{CURRENCY}{reportData.totals.netSales.toFixed(3)}</div>
                  </div>
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{reportType === 'cashier' ? 'Cashier' : 'Location'}</th>
                        <th style={{ textAlign: 'right' }}>Orders</th>
                        <th style={{ textAlign: 'right' }}>Cash</th>
                        <th style={{ textAlign: 'right' }}>KNET</th>
                        <th style={{ textAlign: 'right' }}>Card</th>
                        <th style={{ textAlign: 'right' }}>Refunds</th>
                        <th style={{ textAlign: 'right' }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.rows.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No sales in this range</td></tr>
                      )}
                      {reportData.rows.map((r, i) => (
                        <tr key={i}>
                          <td>{reportType === 'cashier' ? r.cashierName : r.locationName}</td>
                          <td style={{ textAlign: 'right' }}>{r.orderCount}</td>
                          <td style={{ textAlign: 'right' }}>{CURRENCY}{r.cashSales.toFixed(3)}</td>
                          <td style={{ textAlign: 'right' }}>{CURRENCY}{(r.knetSales || 0).toFixed(3)}</td>
                          <td style={{ textAlign: 'right' }}>{CURRENCY}{r.cardSales.toFixed(3)}</td>
                          <td style={{ textAlign: 'right' }}>{CURRENCY}{((r.cashRefunds || 0) + (r.cardRefunds || 0) + (r.knetRefunds || 0)).toFixed(3)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{r.netSales.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {reportType === 'location' && reportData.topItems?.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <h3 style={{ marginBottom: '0.75rem' }}>Top selling items</h3>
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th style={{ textAlign: 'right' }}>Qty sold</th>
                            <th style={{ textAlign: 'right' }}>Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.topItems.map((it, i) => (
                            <tr key={i}>
                              <td>{it.name}</td>
                              <td style={{ textAlign: 'right' }}>{it.qty}</td>
                              <td style={{ textAlign: 'right' }}>{CURRENCY}{it.revenue.toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'returns' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h2>Sales Returns</h2>
              <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
                {salesReturns.length} return{salesReturns.length === 1 ? '' : 's'}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
                <input type="date" value={returnsFilter.from} onChange={(e) => setReturnsFilter({ ...returnsFilter, from: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
                <input type="date" value={returnsFilter.to} onChange={(e) => setReturnsFilter({ ...returnsFilter, to: e.target.value })} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
                <select value={returnsFilter.locationId} onChange={(e) => setReturnsFilter({ ...returnsFilter, locationId: e.target.value })}>
                  <option value="">All</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Refund method</label>
                <select value={returnsFilter.refundMethod} onChange={(e) => setReturnsFilter({ ...returnsFilter, refundMethod: e.target.value })}>
                  <option value="">All</option>
                  <option value="cash">Cash</option>
                  <option value="knet">KNET</option>
                  <option value="card">Card</option>
                  <option value="store_credit">Store credit</option>
                </select>
              </div>
              <button className="btn btn-secondary" onClick={() => setReturnsFilter({ from: '', to: '', locationId: '', refundMethod: '' })}>
                Clear
              </button>
            </div>

            {(() => {
              const totals = salesReturns.reduce((s, r) => {
                if (r.status === 'cancelled') return s;
                const amt = parseFloat(r.refundAmount || 0);
                s.total += amt;
                if (r.refundMethod === 'cash') s.cash += amt;
                if (r.refundMethod === 'card') s.card += amt;
                if (r.refundMethod === 'knet') s.knet += amt;
                if (r.refundMethod === 'store_credit') s.credit += amt;
                return s;
              }, { total: 0, cash: 0, card: 0, knet: 0, credit: 0 });
              return (
                <div className="dash-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div className="dash-card"><div className="dash-card-label">Total refunded</div><div className="dash-card-value">{CURRENCY}{totals.total.toFixed(3)}</div></div>
                  <div className="dash-card"><div className="dash-card-label">Cash refunds</div><div className="dash-card-value">{CURRENCY}{totals.cash.toFixed(3)}</div></div>
                  <div className="dash-card"><div className="dash-card-label">KNET refunds</div><div className="dash-card-value">{CURRENCY}{totals.knet.toFixed(3)}</div></div>
                  <div className="dash-card"><div className="dash-card-label">Card refunds</div><div className="dash-card-value">{CURRENCY}{totals.card.toFixed(3)}</div></div>
                  <div className="dash-card"><div className="dash-card-label">Store credit</div><div className="dash-card-value">{CURRENCY}{totals.credit.toFixed(3)}</div></div>
                </div>
              );
            })()}

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Return #</th>
                    <th>Order</th>
                    <th>Location</th>
                    <th>Cashier</th>
                    <th>Method</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {salesReturns.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No returns in this range</td></tr>}
                  {salesReturns.map((r) => (
                    <tr key={r.id} style={{ opacity: r.status === 'cancelled' ? 0.5 : 1 }}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{new Date(r.createdAt).toLocaleString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.returnNumber}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.Order?.orderNumber}</td>
                      <td>{r.Location?.name || '—'}</td>
                      <td>{r.processor?.name || '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.refundMethod.replace('_', ' ')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{parseFloat(r.refundAmount).toFixed(3)}</td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                          background: r.status === 'completed' ? 'rgba(90,138,106,0.15)' : 'rgba(220,38,38,0.15)',
                          color: r.status === 'completed' ? 'var(--success)' : 'var(--danger)',
                          textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => api.get(`/returns/${r.id}`).then((res) => setReturnDetail(res.data))}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {returnDetail && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setReturnDetail(null); }}>
                <div className="admin-form" style={{ maxWidth: 640 }}>
                  <h3>Return {returnDetail.returnNumber}</h3>
                  <div style={{ marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    <div>Original order: <strong>{returnDetail.Order?.orderNumber}</strong></div>
                    <div>Location: {returnDetail.Location?.name}</div>
                    <div>Processed by: {returnDetail.processor?.name}</div>
                    <div>Method: {returnDetail.refundMethod.replace('_', ' ')}</div>
                    {returnDetail.reason && <div>Reason: {returnDetail.reason}</div>}
                    {returnDetail.notes && <div>Notes: {returnDetail.notes}</div>}
                  </div>

                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Refund</th><th>To stock</th></tr></thead>
                      <tbody>
                        {(returnDetail.items || []).map((it, i) => (
                          <tr key={i}>
                            <td>{it.name}</td>
                            <td style={{ textAlign: 'right' }}>{it.quantity}</td>
                            <td style={{ textAlign: 'right' }}>{CURRENCY}{parseFloat(it.refundAmount).toFixed(3)}</td>
                            <td>{it.returnToStock === false ? 'No' : 'Yes'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--border-light)', marginTop: '0.75rem' }}>
                    <strong>Total refunded</strong>
                    <strong>{CURRENCY}{parseFloat(returnDetail.refundAmount).toFixed(3)}</strong>
                  </div>

                  <div className="form-actions" style={{ marginTop: '1rem' }}>
                    {isAdmin && returnDetail.status === 'completed' && (
                      <button className="btn btn-secondary" onClick={async () => {
                        if (!confirm('Cancel this return? Stock will be deducted and refund reversed.')) return;
                        try {
                          await api.post(`/returns/${returnDetail.id}/cancel`);
                          toast.success('Return cancelled');
                          setReturnDetail(null);
                          // Refresh list
                          api.get('/returns').then((res) => setSalesReturns(res.data));
                        } catch (err) {
                          toast.error(err.response?.data?.message || 'Failed');
                        }
                      }}>Cancel return</button>
                    )}
                    <button className="btn btn-primary" onClick={() => setReturnDetail(null)}>Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'suppliers' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h2>Suppliers</h2>
              <button className="btn btn-primary" onClick={() => setSupplierForm({ name: '', code: '', contactPerson: '', email: '', phone: '', address: '', city: '', country: '', taxId: '', paymentTerms: 'cash', openingBalance: 0, creditLimit: '', notes: '', active: true, _editing: false })}>
                <HiPlus /> Add Supplier
              </button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Code</th><th>Contact</th><th>Phone</th><th>Terms</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {suppliers.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No suppliers yet</td></tr>}
                  {suppliers.map((s) => (
                    <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{s.code || '—'}</td>
                      <td>{s.contactPerson || '—'}</td>
                      <td>{s.phone || '—'}</td>
                      <td style={{ textTransform: 'uppercase', fontSize: '0.78rem' }}>{s.paymentTerms}</td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px',
                          background: s.active ? 'rgba(90,138,106,0.15)' : 'rgba(100,116,139,0.15)',
                          color: s.active ? 'var(--success)' : 'var(--text-light)' }}>
                          {s.active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                          onClick={() => api.get(`/suppliers/${s.id}/statement`).then((res) => setSupplierDetail(res.data))}>
                          View
                        </button>
                        <button className="icon-btn" onClick={() => setSupplierForm({ ...s, openingBalance: s.openingBalance || 0, creditLimit: s.creditLimit || '', _editing: true })}>
                          <HiPencil />
                        </button>
                        <button className="icon-btn" onClick={async () => {
                          if (!confirm('Delete supplier? Soft-deleted if any PO history exists.')) return;
                          try { await api.delete(`/suppliers/${s.id}`); api.get('/suppliers').then((r) => setSuppliers(r.data)); }
                          catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
                        }}><HiTrash /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {supplierForm && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSupplierForm(null); }}>
                <form className="admin-form" onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const body = { ...supplierForm };
                    delete body._editing;
                    if (body.creditLimit === '') body.creditLimit = null;
                    if (supplierForm._editing) await api.put(`/suppliers/${supplierForm.id}`, body);
                    else await api.post('/suppliers', body);
                    toast.success(supplierForm._editing ? 'Updated' : 'Created');
                    setSupplierForm(null);
                    api.get('/suppliers').then((r) => setSuppliers(r.data));
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Failed');
                  }
                }}>
                  <h3>{supplierForm._editing ? 'Edit Supplier' : 'New Supplier'}</h3>
                  <div className="form-row">
                    <div className="form-group"><label>Name *</label><input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required /></div>
                    <div className="form-group"><label>Code</label><input value={supplierForm.code || ''} onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Contact person</label><input value={supplierForm.contactPerson || ''} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} /></div>
                    <div className="form-group"><label>Phone</label><input value={supplierForm.phone || ''} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Email</label><input type="email" value={supplierForm.email || ''} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
                    <div className="form-group"><label>Tax ID</label><input value={supplierForm.taxId || ''} onChange={(e) => setSupplierForm({ ...supplierForm, taxId: e.target.value })} /></div>
                  </div>
                  <div className="form-group"><label>Address</label><textarea rows={2} value={supplierForm.address || ''} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></div>
                  <div className="form-row">
                    <div className="form-group"><label>City</label><input value={supplierForm.city || ''} onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })} /></div>
                    <div className="form-group"><label>Country</label><input value={supplierForm.country || ''} onChange={(e) => setSupplierForm({ ...supplierForm, country: e.target.value })} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Payment terms</label>
                      <select value={supplierForm.paymentTerms} onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })}>
                        <option value="cash">Cash</option><option value="net15">Net 15</option><option value="net30">Net 30</option><option value="net45">Net 45</option><option value="net60">Net 60</option><option value="net90">Net 90</option>
                      </select>
                    </div>
                    <div className="form-group"><label>Opening balance ({CURRENCY})</label>
                      <input type="number" step="0.001" value={supplierForm.openingBalance} onChange={(e) => setSupplierForm({ ...supplierForm, openingBalance: e.target.value })} />
                    </div>
                    <div className="form-group"><label>Credit limit ({CURRENCY})</label>
                      <input type="number" step="0.001" value={supplierForm.creditLimit} onChange={(e) => setSupplierForm({ ...supplierForm, creditLimit: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group"><label>Notes</label><textarea rows={2} value={supplierForm.notes || ''} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></div>
                  <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" checked={!!supplierForm.active} onChange={(e) => setSupplierForm({ ...supplierForm, active: e.target.checked })} /> Active
                  </label></div>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">{supplierForm._editing ? 'Save' : 'Create'}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setSupplierForm(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {supplierDetail && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSupplierDetail(null); }}>
                <div className="admin-form" style={{ maxWidth: 760 }}>
                  <h3>{supplierDetail.supplier.name} — Statement</h3>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
                    <div><span style={{ color: 'var(--text-light)' }}>Opening</span> <strong>{CURRENCY}{parseFloat(supplierDetail.openingBalance).toFixed(3)}</strong></div>
                    <div><span style={{ color: 'var(--text-light)' }}>Closing</span> <strong style={{ color: supplierDetail.closingBalance > 0 ? 'var(--danger)' : 'var(--success)' }}>{CURRENCY}{parseFloat(supplierDetail.closingBalance).toFixed(3)}</strong></div>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Date</th><th>Type</th><th>Ref</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                      <tbody>
                        {supplierDetail.entries.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-light)' }}>No transactions</td></tr>}
                        {supplierDetail.entries.map((e, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '0.82rem' }}>{new Date(e.date).toLocaleDateString()}</td>
                            <td style={{ textTransform: 'capitalize' }}>{e.type}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{e.ref}</td>
                            <td style={{ textAlign: 'right' }}>{e.debit > 0 ? `${CURRENCY}${e.debit.toFixed(3)}` : ''}</td>
                            <td style={{ textAlign: 'right' }}>{e.credit > 0 ? `${CURRENCY}${e.credit.toFixed(3)}` : ''}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{e.balance.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-actions" style={{ marginTop: '1rem' }}>
                    <button className="btn btn-primary" onClick={() => setSupplierDetail(null)}>Close</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'purchase-orders' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h2>Purchase Orders</h2>
              <button className="btn btn-primary" onClick={() => setPoForm({
                supplierId: '', locationId: '', items: [], shippingCost: 0, discount: 0, expectedDate: '', notes: '', status: 'draft', _editing: false,
              })}><HiPlus /> New PO</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Status</label>
                <select value={poFilter.status} onChange={(e) => setPoFilter({ ...poFilter, status: e.target.value })}>
                  <option value="">All</option>
                  <option value="draft">Draft</option><option value="sent">Sent</option><option value="partial">Partial</option><option value="received">Received</option><option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Supplier</label>
                <select value={poFilter.supplierId} onChange={(e) => setPoFilter({ ...poFilter, supplierId: e.target.value })}>
                  <option value="">All</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
                <select value={poFilter.locationId} onChange={(e) => setPoFilter({ ...poFilter, locationId: e.target.value })}>
                  <option value="">All</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={() => setPoFilter({ status: '', supplierId: '', locationId: '' })}>Clear</button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Date</th><th>PO #</th><th>Supplier</th><th>Location</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Paid</th><th>Status</th><th>Payment</th><th></th></tr>
                </thead>
                <tbody>
                  {purchaseOrders.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No purchase orders</td></tr>}
                  {purchaseOrders.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: '0.82rem' }}>{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{p.poNumber}</td>
                      <td>{p.Supplier?.name || '—'}</td>
                      <td>{p.Location?.name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{parseFloat(p.totalAmount).toFixed(3)}</td>
                      <td style={{ textAlign: 'right' }}>{CURRENCY}{parseFloat(p.amountPaid || 0).toFixed(3)}</td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px', textTransform: 'uppercase',
                          background: p.status === 'received' ? 'rgba(90,138,106,0.15)' : p.status === 'cancelled' ? 'rgba(220,38,38,0.15)' : 'rgba(196,120,74,0.15)',
                          color: p.status === 'received' ? 'var(--success)' : p.status === 'cancelled' ? 'var(--danger)' : 'var(--copper)' }}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px', textTransform: 'uppercase',
                          background: p.paymentStatus === 'paid' ? 'rgba(90,138,106,0.15)' : 'rgba(100,116,139,0.15)',
                          color: p.paymentStatus === 'paid' ? 'var(--success)' : 'var(--text-light)' }}>
                          {p.paymentStatus}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => api.get(`/purchase-orders/${p.id}`).then((res) => setPoDetail(res.data))}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PO editor + detail + receive/pay modals — see PoModals below */}
            <PoModals
              poForm={poForm} setPoForm={setPoForm}
              poDetail={poDetail} setPoDetail={setPoDetail}
              receiveForm={receiveForm} setReceiveForm={setReceiveForm}
              payForm={payForm} setPayForm={setPayForm}
              suppliers={suppliers} locations={locations} products={products}
              currency={CURRENCY}
              refresh={() => api.get('/purchase-orders', { params: poFilter }).then((res) => setPurchaseOrders(res.data))}
            />
          </div>
        )}

        {tab === 'purchase-returns' && (
          <div className="admin-section">
            <div className="admin-section-header">
              <h2>Purchase Returns</h2>
              <button className="btn btn-primary" onClick={() => setPrForm({
                supplierId: '', locationId: '', purchaseOrderId: '', items: [], refundMethod: 'credit_note', reason: '', notes: '',
              })}><HiPlus /> New Purchase Return</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-alt, #f8f9fa)', borderRadius: 8 }}>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>From</label>
                <input type="date" value={prFilter.from} onChange={(e) => setPrFilter({ ...prFilter, from: e.target.value })} /></div>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>To</label>
                <input type="date" value={prFilter.to} onChange={(e) => setPrFilter({ ...prFilter, to: e.target.value })} /></div>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Supplier</label>
                <select value={prFilter.supplierId} onChange={(e) => setPrFilter({ ...prFilter, supplierId: e.target.value })}>
                  <option value="">All</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div><label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Location</label>
                <select value={prFilter.locationId} onChange={(e) => setPrFilter({ ...prFilter, locationId: e.target.value })}>
                  <option value="">All</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <button className="btn btn-secondary" onClick={() => setPrFilter({ from: '', to: '', supplierId: '', locationId: '' })}>Clear</button>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Date</th><th>Return #</th><th>Supplier</th><th>Location</th><th>Method</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {purchaseReturns.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No purchase returns</td></tr>}
                  {purchaseReturns.map((r) => (
                    <tr key={r.id} style={{ opacity: r.status === 'cancelled' ? 0.5 : 1 }}>
                      <td style={{ fontSize: '0.82rem' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.returnNumber}</td>
                      <td>{r.Supplier?.name || '—'}</td>
                      <td>{r.Location?.name || '—'}</td>
                      <td style={{ textTransform: 'capitalize' }}>{r.refundMethod.replace('_', ' ')}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{CURRENCY}{parseFloat(r.totalAmount).toFixed(3)}</td>
                      <td>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '100px', textTransform: 'uppercase',
                          background: r.status === 'completed' ? 'rgba(90,138,106,0.15)' : 'rgba(220,38,38,0.15)',
                          color: r.status === 'completed' ? 'var(--success)' : 'var(--danger)' }}>{r.status}</span>
                      </td>
                      <td><button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => api.get(`/purchase-returns/${r.id}`).then((res) => setPrDetail(res.data))}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PurchaseReturnModals
              prForm={prForm} setPrForm={setPrForm}
              prDetail={prDetail} setPrDetail={setPrDetail}
              suppliers={suppliers} locations={locations} products={products}
              currency={CURRENCY} isAdmin={isAdmin}
              refresh={() => api.get('/purchase-returns', { params: prFilter }).then((res) => setPurchaseReturns(res.data))}
            />
          </div>
        )}

        {(['stock-counts','stock-count-detail','variance-report'].includes(tab)) && (
          <StockCounts
            tab={tab} currency={CURRENCY} locations={locations}
            setTab={setTab}
            activeStockCountId={activeStockCountId} setActiveStockCountId={setActiveStockCountId}
            expenseCategories={expenseCategories} cashAccounts={cashAccounts}
          />
        )}

        {(['cash-accounts','expenses','cash-transfers','daily-cash','daybook','pnl','stock-value'].includes(tab)) && (
          <FinanceTabs
            tab={tab} currency={CURRENCY} isAdmin={isAdmin} locations={locations}
            cashAccounts={cashAccounts} setCashAccounts={setCashAccounts}
            cashAccountForm={cashAccountForm} setCashAccountForm={setCashAccountForm}
            expenses={expenses} setExpenses={setExpenses}
            expenseFilter={expenseFilter} setExpenseFilter={setExpenseFilter}
            expenseForm={expenseForm} setExpenseForm={setExpenseForm}
            expenseCategories={expenseCategories} setExpenseCategories={setExpenseCategories}
            expenseCatForm={expenseCatForm} setExpenseCatForm={setExpenseCatForm}
            cashTransfers={cashTransfers} setCashTransfers={setCashTransfers}
            cashTransferForm={cashTransferForm} setCashTransferForm={setCashTransferForm}
            dailyCash={dailyCash} setDailyCash={setDailyCash}
            dailyCashFilter={dailyCashFilter} setDailyCashFilter={setDailyCashFilter}
            daybook={daybook} daybookFilter={daybookFilter} setDaybookFilter={setDaybookFilter}
            pnl={pnl} pnlFilter={pnlFilter} setPnlFilter={setPnlFilter}
            stockValue={stockValue} stockValueFilter={stockValueFilter} setStockValueFilter={setStockValueFilter}
          />
        )}

        {tab === 'categories' && (
          <div>
            <Button className="mb-4" onClick={() => setCatForm({ name: '', nameAr: '', image: '', sortOrder: 0, active: true, _editing: false })}>
              <Plus className="size-4" /> Add Category
            </Button>

            <Dialog open={!!catForm} onOpenChange={(o) => { if (!o) setCatForm(null); }}>
              {catForm && (
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{catForm._editing ? 'Edit Category' : 'New Category'}</DialogTitle></DialogHeader>
                  <form className="flex flex-col gap-4" onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const payload = { name: catForm.name, nameAr: catForm.nameAr || null, image: catForm.image, sortOrder: catForm.sortOrder, active: catForm.active };
                      if (catForm._editing) { await api.put(`/categories/${catForm._id}`, payload); toast.success('Category updated'); }
                      else { await api.post('/categories', payload); toast.success('Category created'); }
                      setCatForm(null);
                      api.get('/categories/all').then((res) => setAdminCategories(res.data));
                    } catch (error) { toast.error(error.response?.data?.message || 'Failed'); }
                  }}>
                    <div className="flex flex-col gap-2">
                      <Label>Category Name</Label>
                      <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Arabic Name (optional)</Label>
                      <Input dir="rtl" placeholder="الاسم بالعربية" value={catForm.nameAr || ''} onChange={(e) => setCatForm({ ...catForm, nameAr: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Category Image</Label>
                      {catForm.image && (
                        <img src={catForm.image} alt="Preview" className="size-20 rounded-md border border-border object-cover" />
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            setCatUploading(true);
                            try {
                              const formData = new FormData();
                              formData.append('image', file);
                              const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                              setCatForm({ ...catForm, image: data.url });
                            } catch (err) { toast.error('Upload failed'); } finally { setCatUploading(false); }
                          }}
                        />
                        {catUploading && <span className="text-xs text-primary">Uploading…</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 items-end gap-4">
                      <div className="flex flex-col gap-2">
                        <Label>Sort Order</Label>
                        <Input type="number" value={catForm.sortOrder} onChange={(e) => setCatForm({ ...catForm, sortOrder: parseInt(e.target.value) || 0 })} />
                      </div>
                      <label className="flex items-center gap-2 pb-2 text-sm">
                        <Checkbox checked={catForm.active} onCheckedChange={(v) => setCatForm({ ...catForm, active: !!v })} /> Active
                      </label>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setCatForm(null)}>Cancel</Button>
                      <Button type="submit">{catForm._editing ? 'Update' : 'Create'}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              )}
            </Dialog>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead><TableHead>Name</TableHead><TableHead>Arabic Name</TableHead><TableHead>Order</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminCategories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        {c.image ? (
                          <img src={c.image} alt={c.name} className="size-11 rounded-md object-cover" />
                        ) : (
                          <div className="flex size-11 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">No img</div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell dir="rtl" className="text-right">{c.nameAr || <span dir="ltr" className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{c.sortOrder}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={c.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}>{c.active ? 'Active' : 'Hidden'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" onClick={() => setCatForm({ ...c, _editing: true, _id: c.id })}><Pencil className="size-4" /></Button>
                          <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                            if (!confirm('Delete this category?')) return;
                            await api.delete(`/categories/${c.id}`);
                            setAdminCategories(adminCategories.filter((x) => x.id !== c.id));
                            toast.success('Deleted');
                          }}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {adminCategories.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No categories yet. Add categories to show on the home page.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {tab === 'customers' && (
          <div>
            {/* Search + Toggle */}
            <div className="mb-4 flex flex-wrap gap-3">
              <Input
                type="text"
                placeholder="Search by name, email, or phone…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="min-w-48 flex-1"
              />
              <div className="flex items-center rounded-md border border-input p-0.5">
                <button onClick={() => setCustomerView('registered')} className={cn('rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wide', customerView === 'registered' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Registered ({customers.length})</button>
                <button onClick={() => setCustomerView('guests')} className={cn('rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wide', customerView === 'guests' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>Guests ({guestCustomers.length})</button>
              </div>
            </div>

            {/* Order History Modal */}
            <Dialog open={!!customerOrders} onOpenChange={(o) => { if (!o) setCustomerOrders(null); }}>
              {customerOrders && (
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{customerOrders.name}&apos;s Orders</DialogTitle></DialogHeader>
                  {customerOrders.orders.length === 0 ? (
                    <p className="py-4 text-muted-foreground">No orders found</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {customerOrders.orders.map((o) => (
                        <div key={o.id} className="rounded-lg border border-border p-4 text-sm">
                          <div className="mb-1 flex justify-between">
                            <strong>{o.orderNumber}</strong>
                            <span className={cn('text-xs font-semibold uppercase', o.paymentStatus === 'paid' ? 'text-emerald-600' : 'text-primary')}>{o.paymentStatus}</span>
                          </div>
                          <div className="mb-1 text-muted-foreground">
                            {new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}{o.paymentMethod} · <strong>{CURRENCY}{parseFloat(o.totalAmount).toFixed(2)}</strong>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {o.items.map((item, i) => (
                              <span key={i}>{item.name}{item.variant ? ` (${Object.entries(item.variant).filter(([k]) => k !== 'sku').map(([k, v]) => v).join(', ')})` : ''} x{item.quantity}{i < o.items.length - 1 ? ', ' : ''}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <DialogFooter><Button variant="ghost" onClick={() => setCustomerOrders(null)}>Close</Button></DialogFooter>
                </DialogContent>
              )}
            </Dialog>

            {(() => {
              const isGuests = customerView === 'guests';
              const rows = isGuests ? guestCustomers : customers;
              return (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Orders</TableHead><TableHead>Total Spent</TableHead><TableHead>{isGuests ? 'Last Order' : 'Joined'}</TableHead><TableHead>History</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((c, i) => (
                        <TableRow key={c.id ?? i}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{c.email}</TableCell>
                          <TableCell>{c.phone || '-'}</TableCell>
                          <TableCell>{c.orderCount}</TableCell>
                          <TableCell>{CURRENCY}{c.totalSpent.toFixed(2)}</TableCell>
                          <TableCell>{new Date(isGuests ? c.lastOrder : c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</TableCell>
                          <TableCell>
                            <Button size="icon-sm" variant="ghost" title="View orders" onClick={async () => {
                              const { data } = isGuests
                                ? await api.get(`/customers/guest-orders?email=${encodeURIComponent(c.email)}`)
                                : await api.get(`/customers/${c.id}/orders`);
                              setCustomerOrders({ name: c.name, orders: data });
                            }}><Search className="size-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {rows.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{isGuests ? 'No guest orders yet' : 'No customers found'}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </div>
        )}

        {tab === 'coupons' && (
          <div>
            <Button className="mb-4" onClick={() => setCouponForm({ code: '', description: '', type: 'percentage', value: '', minOrderAmount: '', maxDiscount: '', usageLimit: '', perUserLimit: '1', startDate: '', endDate: '', active: true, applicableCategories: null, applicableProducts: null, applicablePaymentMethods: null, _editing: false })}>
              <Plus className="size-4" /> Create Coupon
            </Button>

            <Dialog open={!!couponForm} onOpenChange={(o) => { if (!o) setCouponForm(null); }}>
              {couponForm && (
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{couponForm._editing ? 'Edit Coupon' : 'New Coupon'}</DialogTitle></DialogHeader>
                  <form className="flex flex-col gap-4" onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const payload = { ...couponForm };
                      delete payload._editing; delete payload._id;
                      if (payload.applicableCategories && payload.applicableCategories.length === 0) payload.applicableCategories = null;
                      if (payload.applicableProducts && payload.applicableProducts.length === 0) payload.applicableProducts = null;
                      if (payload.applicablePaymentMethods && payload.applicablePaymentMethods.length === 0) payload.applicablePaymentMethods = null;
                      if (couponForm._editing) { await api.put(`/coupons/${couponForm._id}`, payload); toast.success('Coupon updated'); }
                      else { await api.post('/coupons', payload); toast.success('Coupon created'); }
                      setCouponForm(null);
                      api.get('/coupons').then((res) => setCoupons(res.data));
                    } catch (error) { toast.error(error.response?.data?.message || 'Failed'); }
                  }}>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-2">
                        <Label>Code</Label>
                        <Input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} required placeholder="SAVE20" className="font-mono font-semibold uppercase" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Type</Label>
                        <Select value={couponForm.type} onValueChange={(v) => setCouponForm({ ...couponForm, type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                            <SelectItem value="fixed">{`Fixed Amount (${CURRENCY})`}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>{couponForm.type === 'percentage' ? 'Discount (%)' : `Discount (${CURRENCY})`}</Label>
                        <Input type="number" step="0.01" value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })} required />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Description (optional)</Label>
                      <Input value={couponForm.description} onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })} placeholder="e.g. 20% off on your first order" />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex flex-col gap-2">
                        <Label>Min Order Amount</Label>
                        <Input type="number" step="0.01" value={couponForm.minOrderAmount} onChange={(e) => setCouponForm({ ...couponForm, minOrderAmount: e.target.value })} placeholder="0" />
                      </div>
                      {couponForm.type === 'percentage' && (
                        <div className="flex flex-col gap-2">
                          <Label>{`Max Discount (${CURRENCY})`}</Label>
                          <Input type="number" step="0.01" value={couponForm.maxDiscount} onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: e.target.value })} placeholder="No limit" />
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        <Label>Usage Limit</Label>
                        <Input type="number" value={couponForm.usageLimit} onChange={(e) => setCouponForm({ ...couponForm, usageLimit: e.target.value })} placeholder="Unlimited" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Per User Limit</Label>
                        <Input type="number" value={couponForm.perUserLimit} onChange={(e) => setCouponForm({ ...couponForm, perUserLimit: e.target.value })} />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label>Start Date</Label>
                        <Input type="date" value={couponForm.startDate?.split('T')[0] || ''} onChange={(e) => setCouponForm({ ...couponForm, startDate: e.target.value || null })} />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>End Date</Label>
                        <Input type="date" value={couponForm.endDate?.split('T')[0] || ''} onChange={(e) => setCouponForm({ ...couponForm, endDate: e.target.value || null })} />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Applies To</Label>
                      <Select
                        value={couponForm.applicableProducts?.length ? 'products' : couponForm.applicableCategories?.length ? 'categories' : 'all'}
                        onValueChange={(v) => setCouponForm({ ...couponForm, applicableCategories: v === 'categories' ? [] : null, applicableProducts: v === 'products' ? [] : null })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Products</SelectItem>
                          <SelectItem value="categories">Specific Categories</SelectItem>
                          <SelectItem value="products">Specific Products</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {couponForm.applicableCategories !== null && Array.isArray(couponForm.applicableCategories) && (
                      <div className="flex flex-col gap-2">
                        <Label>Select Categories</Label>
                        <div className="flex flex-wrap gap-2">
                          {adminCategories.map((cat) => {
                            const name = cat.name || cat;
                            const selected = couponForm.applicableCategories.includes(name);
                            return (
                              <button type="button" key={name}
                                onClick={() => setCouponForm({ ...couponForm, applicableCategories: selected ? couponForm.applicableCategories.filter((c) => c !== name) : [...couponForm.applicableCategories, name] })}
                                className={cn('rounded-full border px-3 py-1.5 text-sm font-medium', selected ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:bg-accent')}>
                                {name}
                              </button>
                            );
                          })}
                        </div>
                        {couponForm.applicableCategories.length === 0 && <p className="text-xs text-destructive">Select at least one category</p>}
                      </div>
                    )}

                    {couponForm.applicableProducts !== null && Array.isArray(couponForm.applicableProducts) && (
                      <div className="flex flex-col gap-2">
                        <Label>Select Products</Label>
                        <Select value="" onValueChange={(v) => { const pid = parseInt(v); if (pid && !couponForm.applicableProducts.includes(pid)) setCouponForm({ ...couponForm, applicableProducts: [...couponForm.applicableProducts, pid] }); }}>
                          <SelectTrigger><SelectValue placeholder="Search and select a product…" /></SelectTrigger>
                          <SelectContent>
                            {products.filter((p) => !couponForm.applicableProducts.includes(p.id)).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex flex-wrap gap-2">
                          {couponForm.applicableProducts.map((pid) => {
                            const p = products.find((x) => x.id === pid);
                            return (
                              <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                                {p ? p.name : `#${pid}`}
                                <button type="button" onClick={() => setCouponForm({ ...couponForm, applicableProducts: couponForm.applicableProducts.filter((x) => x !== pid) })}><X className="size-3.5" /></button>
                              </span>
                            );
                          })}
                        </div>
                        {couponForm.applicableProducts.length === 0 && <p className="text-xs text-destructive">Select at least one product</p>}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <Label>Payment Methods</Label>
                      <Select value={couponForm.applicablePaymentMethods ? '__specific' : 'all'} onValueChange={(v) => setCouponForm({ ...couponForm, applicablePaymentMethods: v === 'all' ? null : [] })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Payment Methods</SelectItem>
                          <SelectItem value="__specific">Specific Methods</SelectItem>
                        </SelectContent>
                      </Select>
                      {couponForm.applicablePaymentMethods !== null && Array.isArray(couponForm.applicablePaymentMethods) && (
                        <>
                          <Select value="" onValueChange={(id) => { if (id && !couponForm.applicablePaymentMethods.includes(id)) setCouponForm({ ...couponForm, applicablePaymentMethods: [...couponForm.applicablePaymentMethods, id] }); }}>
                            <SelectTrigger><SelectValue placeholder="Select a payment method…" /></SelectTrigger>
                            <SelectContent>
                              {availableGateways.filter((pm) => !couponForm.applicablePaymentMethods.includes(pm.id)).map((pm) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <div className="flex flex-wrap gap-2">
                            {couponForm.applicablePaymentMethods.map((mid) => {
                              const pm = availableGateways.find((x) => x.id === mid);
                              return (
                                <span key={mid} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                                  {pm ? pm.name : mid}
                                  <button type="button" onClick={() => setCouponForm({ ...couponForm, applicablePaymentMethods: couponForm.applicablePaymentMethods.filter((x) => x !== mid) })}><X className="size-3.5" /></button>
                                </span>
                              );
                            })}
                          </div>
                          {couponForm.applicablePaymentMethods.length === 0 && <p className="text-xs text-destructive">Select at least one payment method</p>}
                        </>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={couponForm.active} onCheckedChange={(v) => setCouponForm({ ...couponForm, active: !!v })} /> Active
                    </label>

                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setCouponForm(null)}>Cancel</Button>
                      <Button type="submit">{couponForm._editing ? 'Update' : 'Create'}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              )}
            </Dialog>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead><TableHead>Type</TableHead><TableHead>Value</TableHead><TableHead>Min Order</TableHead><TableHead>Applies To</TableHead><TableHead>Used</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                      <TableCell className="capitalize">{c.type}</TableCell>
                      <TableCell>{c.type === 'percentage' ? `${c.value}%` : `${CURRENCY}${parseFloat(c.value).toFixed(2)}`}{c.maxDiscount ? ` (max ${CURRENCY}${parseFloat(c.maxDiscount).toFixed(0)})` : ''}</TableCell>
                      <TableCell>{parseFloat(c.minOrderAmount) > 0 ? `${CURRENCY}${parseFloat(c.minOrderAmount).toFixed(0)}` : '-'}</TableCell>
                      <TableCell className="max-w-48 truncate text-sm">
                        {c.applicableProducts?.length ? c.applicableProducts.map((pid) => { const p = products.find((x) => x.id === pid); return p ? p.name : `#${pid}`; }).join(', ') : c.applicableCategories?.length ? c.applicableCategories.join(', ') : 'All Products'}
                      </TableCell>
                      <TableCell>{c.usedCount}{c.usageLimit ? `/${c.usageLimit}` : ''}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={c.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}>{c.active ? 'Active' : 'Inactive'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" onClick={() => setCouponForm({ ...c, _editing: true, _id: c.id })}><Pencil className="size-4" /></Button>
                          <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                            if (!confirm('Delete this coupon?')) return;
                            await api.delete(`/coupons/${c.id}`);
                            setCoupons(coupons.filter((x) => x.id !== c.id));
                            toast.success('Deleted');
                          }}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {coupons.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No coupons yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {tab === 'reviews' && (
          <div>
            <Button className="mb-4" onClick={() => setReviewForm({ productId: '', name: '', rating: 5, title: '', comment: '', verified: false })}>
              <Plus className="size-4" /> Add Review
            </Button>

            <Dialog open={!!reviewForm} onOpenChange={(o) => { if (!o) setReviewForm(null); }}>
              {reviewForm && (
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Add Review</DialogTitle></DialogHeader>
                  <form className="flex flex-col gap-4" onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await api.post('/reviews/admin', reviewForm);
                      toast.success('Review added');
                      setReviewForm(null);
                      api.get('/reviews/all').then((res) => setReviews(res.data.reviews));
                    } catch (error) { toast.error(error.response?.data?.message || 'Failed'); }
                  }}>
                    <div className="flex flex-col gap-2">
                      <Label>Product</Label>
                      <Select value={String(reviewForm.productId)} onValueChange={(v) => setReviewForm({ ...reviewForm, productId: v })}>
                        <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label>Reviewer Name</Label>
                        <Input value={reviewForm.name} onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })} required placeholder="John Doe" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Rating</Label>
                        <Select value={String(reviewForm.rating)} onValueChange={(v) => setReviewForm({ ...reviewForm, rating: parseInt(v) })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{n} Star{n > 1 ? 's' : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Title (optional)</Label>
                      <Input value={reviewForm.title} onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })} placeholder="Great product!" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Review</Label>
                      <Textarea value={reviewForm.comment} onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })} rows={3} required placeholder="Write the review content…" />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={reviewForm.verified} onCheckedChange={(v) => setReviewForm({ ...reviewForm, verified: !!v })} /> Show as &quot;Verified Purchase&quot;
                    </label>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setReviewForm(null)}>Cancel</Button>
                      <Button type="submit">Add Review</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              )}
            </Dialog>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead><TableHead>Reviewer</TableHead><TableHead>Rating</TableHead><TableHead>Comment</TableHead><TableHead>Type</TableHead><TableHead>Approved</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-36 truncate">{r.Product?.name || `Product #${r.productId}`}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="whitespace-nowrap text-amber-500">{'★'.repeat(r.rating)}<span className="text-muted-foreground/40">{'★'.repeat(5 - r.rating)}</span></TableCell>
                      <TableCell className="max-w-48 truncate">{r.title ? <strong>{r.title}: </strong> : ''}{r.comment}</TableCell>
                      <TableCell>
                        {r.adminCreated ? <Badge variant="secondary" className="bg-primary/10 text-primary">Admin</Badge>
                          : r.verified ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Verified</Badge>
                          : <span className="text-xs text-muted-foreground">Customer</span>}
                      </TableCell>
                      <TableCell>
                        <Button size="icon-sm" variant="ghost" className={r.approved ? 'text-emerald-600' : 'text-muted-foreground'} title={r.approved ? 'Hide review' : 'Approve review'}
                          onClick={async () => {
                            await api.put(`/reviews/${r.id}/approve`);
                            api.get('/reviews/all').then((res) => setReviews(res.data.reviews));
                            toast.success(r.approved ? 'Hidden' : 'Approved');
                          }}>
                          {r.approved ? <Check className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                            if (!confirm('Delete this review?')) return;
                            await api.delete(`/reviews/${r.id}`);
                            setReviews(reviews.filter((x) => x.id !== r.id));
                            toast.success('Deleted');
                          }}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reviews.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No reviews yet</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {tab === 'abandoned' && (
          <div>
            {/* Stats */}
            <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: 'Total', value: abandonedStats.total || 0 },
                { label: 'Pending', value: abandonedStats.pending || 0 },
                { label: 'Email Sent', value: abandonedStats.sent || 0 },
                { label: 'Recovered', value: abandonedStats.recovered || 0, accent: true },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className={cn('mt-1 text-2xl font-semibold', s.accent && 'text-emerald-600')}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Filter */}
            <div className="mb-4 flex w-fit items-center rounded-md border border-input p-0.5">
              {[{ val: '', label: 'All' }, { val: 'pending', label: 'Pending' }, { val: 'sent', label: 'Sent' }, { val: 'recovered', label: 'Recovered' }].map((f) => (
                <button key={f.val} onClick={() => setAbandonedFilter(f.val)}
                  className={cn('rounded px-3 py-1.5 text-xs font-medium uppercase tracking-wide', abandonedFilter === f.val ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{f.label}</button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead><TableHead>Items</TableHead><TableHead>Total</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {abandonedCarts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.email}</TableCell>
                      <TableCell className="max-w-48 truncate text-sm text-muted-foreground">{c.items.map((i) => i.name).join(', ')}</TableCell>
                      <TableCell>{CURRENCY}{parseFloat(c.cartTotal).toFixed(2)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell>
                        {c.recovered ? <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">Recovered</Badge>
                          : c.emailSent ? <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">Sent</Badge>
                          : <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Pending</Badge>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {!c.recovered && !c.emailSent && (
                            <Button size="sm" variant="outline" onClick={async () => {
                              await api.post(`/abandoned-cart/${c.id}/send`);
                              toast.success('Recovery email sent');
                              api.get(`/abandoned-cart?status=${abandonedFilter}`).then((res) => { setAbandonedCarts(res.data.carts); setAbandonedStats(res.data.stats); });
                            }}>Send</Button>
                          )}
                          <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                            await api.delete(`/abandoned-cart/${c.id}`);
                            setAbandonedCarts(abandonedCarts.filter((x) => x.id !== c.id));
                            toast.success('Deleted');
                          }}><Trash2 className="size-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {abandonedCarts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No abandoned carts</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {tab === 'pincodes' && (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => setPincodeForm({ pincode: '', city: '', state: '', deliveryDays: 7, codAvailable: true, _editing: false })}>
                <HiPlus /> Add Pincode
              </button>
              <button className="btn btn-secondary" onClick={() => setBulkPincodes(bulkPincodes ? '' : ' ')}>
                {bulkPincodes !== '' ? 'Cancel Bulk' : 'Bulk Add'}
              </button>
            </div>

            {/* Bulk Add */}
            {bulkPincodes !== '' && (
              <div style={{ marginBottom: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Bulk Add Pincodes</h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Enter pincodes separated by commas, spaces, or new lines.
                </p>
                <textarea
                  value={bulkPincodes.trim()}
                  onChange={(e) => setBulkPincodes(e.target.value)}
                  rows={4}
                  placeholder="673001, 673002, 673003..."
                  style={{ width: '100%', padding: '0.7rem', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.88rem', fontFamily: 'monospace' }}
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '0.75rem' }}
                  onClick={async () => {
                    const pins = bulkPincodes.split(/[,\s\n]+/).map((p) => p.trim()).filter(Boolean);
                    if (pins.length === 0) return;
                    try {
                      const { data } = await api.post('/pincodes/bulk', { pincodes: pins });
                      toast.success(data.message);
                      setBulkPincodes('');
                      api.get(`/pincodes?search=${pincodeSearch}&limit=100`).then((res) => setPincodes(res.data.pincodes));
                    } catch (error) {
                      toast.error(error.response?.data?.message || 'Bulk add failed');
                    }
                  }}
                >
                  Add Pincodes
                </button>
              </div>
            )}

            {/* Single Add/Edit Form */}
            {pincodeForm && (
              <div className="admin-form-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPincodeForm(null); }}>
                <form className="admin-form" style={{ maxWidth: '500px' }} onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    if (pincodeForm._editing) {
                      await api.put(`/pincodes/${pincodeForm._id}`, pincodeForm);
                      toast.success('Pincode updated');
                    } else {
                      await api.post('/pincodes', pincodeForm);
                      toast.success('Pincode added');
                    }
                    setPincodeForm(null);
                    api.get(`/pincodes?search=${pincodeSearch}&limit=100`).then((res) => setPincodes(res.data.pincodes));
                  } catch (error) {
                    toast.error(error.response?.data?.message || 'Failed');
                  }
                }}>
                  <h3>{pincodeForm._editing ? 'Edit Pincode' : 'Add Pincode'}</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Pincode</label>
                      <input value={pincodeForm.pincode} onChange={(e) => setPincodeForm({ ...pincodeForm, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} required disabled={pincodeForm._editing} />
                    </div>
                    <div className="form-group">
                      <label>Delivery Days</label>
                      <input type="number" value={pincodeForm.deliveryDays} onChange={(e) => setPincodeForm({ ...pincodeForm, deliveryDays: parseInt(e.target.value) || 7 })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>City</label>
                      <input value={pincodeForm.city} onChange={(e) => setPincodeForm({ ...pincodeForm, city: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>State</label>
                      <input value={pincodeForm.state} onChange={(e) => setPincodeForm({ ...pincodeForm, state: e.target.value })} />
                    </div>
                  </div>
                  <label className="checkbox-label" style={{ paddingTop: '0.5rem' }}>
                    <input type="checkbox" checked={pincodeForm.codAvailable} onChange={(e) => setPincodeForm({ ...pincodeForm, codAvailable: e.target.checked })} />
                    Cash on Delivery Available
                  </label>
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">{pincodeForm._editing ? 'Update' : 'Add'}</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setPincodeForm(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {/* Search */}
            <input
              type="text"
              placeholder="Search pincode, city, or state..."
              value={pincodeSearch}
              onChange={(e) => setPincodeSearch(e.target.value)}
              style={{ width: '100%', maxWidth: '350px', padding: '0.55rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.85rem', marginBottom: '1rem', background: 'var(--bg-card)' }}
            />

            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th>Pincode</th>
                    <th>City</th>
                    <th>State</th>
                    <th>Delivery Days</th>
                    <th>COD</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pincodes.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.pincode}</td>
                      <td>{p.city || '-'}</td>
                      <td>{p.state || '-'}</td>
                      <td>{p.deliveryDays} days</td>
                      <td>{p.codAvailable ? '✓' : '✕'}</td>
                      <td>
                        <button className="icon-btn" onClick={() => setPincodeForm({ ...p, _editing: true, _id: p.id })}>
                          <HiPencil />
                        </button>
                        <button className="icon-btn danger" onClick={async () => {
                          if (!confirm('Delete this pincode?')) return;
                          await api.delete(`/pincodes/${p.id}`);
                          setPincodes(pincodes.filter((x) => x.id !== p.id));
                          toast.success('Deleted');
                        }}>
                          <HiTrash />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pincodes.length === 0 && (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      No pincodes added. All deliveries are currently allowed.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginTop: '1rem' }}>
              Note: If no pincodes are added, delivery is allowed to all pincodes. Add pincodes to restrict delivery to specific areas only.
            </p>
          </div>
        )}

        {tab === 'theme' && (
          <div>
            <div className="mb-10">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store Theme</h3>
              <p className="mb-6 text-sm text-muted-foreground">Choose a theme for your storefront. The selected theme will be visible to all customers.</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {themeOptions.map((theme) => (
                  <button
                    key={theme.id}
                    className={cn('relative overflow-hidden rounded-lg border text-left transition-colors', currentTheme === theme.id ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40')}
                    onClick={() => { changeTheme(theme.id); toast.success(`Theme changed to "${theme.name}"`); }}
                  >
                    <div className="h-16 w-full" style={{ background: theme.vars?.['--bg'] || 'var(--muted)' }}>
                      <div className="h-2 w-full" style={{ background: theme.vars?.['--copper'] || 'var(--primary)' }} />
                    </div>
                    <div className="p-3">
                      <strong className="block text-sm">{theme.name}</strong>
                      <span className="text-xs text-muted-foreground">{theme.description}</span>
                    </div>
                    {currentTheme === theme.id && <span className="absolute right-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">Active</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Home Page Banners Carousel */}
            <BannerEditor />

            {/* Mid-page Banner — rendered below the best-sellers section */}
            <BannerEditor
              endpoint="/settings/mid-banners"
              title="Mid-page Banners"
              description="Add up to 3 banners shown after the Best Sellers section on the home page. Useful for promotions, new arrivals, or seasonal campaigns."
              maxBanners={3}
            />

            {/* Category Cards — large coloured tiles on the home page */}
            <CategoryCardsEditor />

            {/* Announcement bar — rotating promo strings shown above the navbar */}
            <AnnouncementEditor />

            {/* B2B bank transfer details — included in quote emails on bank_transfer */}
            <B2BBankDetailsEditor />
          </div>
        )}

        {tab === 'staff' && isAdmin && (
          <div>
            <Button className="mb-4" onClick={() => setStaffForm({ name: '', email: '', password: '', permissions: [], _editing: false })}>
              <Plus className="size-4" /> Add Staff Member
            </Button>

            <Dialog open={!!staffForm} onOpenChange={(o) => { if (!o) setStaffForm(null); }}>
              {staffForm && (
                <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{staffForm._editing ? 'Edit Staff' : 'New Staff Member'}</DialogTitle></DialogHeader>
                  <form className="flex flex-col gap-4" onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      if (staffForm._editing) {
                        await api.put(`/staff/${staffForm._id}`, { name: staffForm.name, permissions: staffForm.permissions, password: staffForm.password || undefined });
                        toast.success('Staff updated');
                      } else { await api.post('/staff', staffForm); toast.success('Staff account created'); }
                      setStaffForm(null);
                      api.get('/staff').then((res) => setStaffList(res.data));
                    } catch (error) { toast.error(error.response?.data?.message || 'Failed'); }
                  }}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label>Name</Label>
                        <Input value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} required />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>Email</Label>
                        <Input type="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} required={!staffForm._editing} disabled={staffForm._editing} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>{staffForm._editing ? 'New Password (leave empty to keep)' : 'Password'}</Label>
                      <Input type="password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} required={!staffForm._editing} minLength={8} placeholder={staffForm._editing ? 'Leave empty to keep current' : 'Min 8 characters'} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Permissions</Label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {availablePerms.map((perm) => {
                          const checked = staffForm.permissions.includes(perm.id);
                          return (
                            <label key={perm.id} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm', checked ? 'border-primary bg-primary/5' : 'border-input')}>
                              <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(v) => setStaffForm({ ...staffForm, permissions: v ? [...staffForm.permissions, perm.id] : staffForm.permissions.filter((p) => p !== perm.id) })} />
                              <div>
                                <strong className="block">{perm.label}</strong>
                                <span className="text-xs text-muted-foreground">{perm.desc}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setStaffForm(null)}>Cancel</Button>
                      <Button type="submit">{staffForm._editing ? 'Update' : 'Create'}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              )}
            </Dialog>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Permissions</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffList.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={cn('uppercase', s.role === 'admin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300')}>{s.role}</Badge>
                      </TableCell>
                      <TableCell className="max-w-52">
                        {s.role === 'admin' ? (
                          <span className="text-sm text-muted-foreground">All access</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(s.permissions || []).map((p) => <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{p}</span>)}
                            {(!s.permissions || s.permissions.length === 0) && <span className="text-sm text-muted-foreground">None</span>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {s.role === 'staff' ? (
                            <>
                              <Button size="icon-sm" variant="ghost" onClick={() => setStaffForm({ ...s, password: '', permissions: s.permissions || [], _editing: true, _id: s.id })}><Pencil className="size-4" /></Button>
                              <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={async () => {
                                if (!confirm(`Delete staff account "${s.name}"?`)) return;
                                await api.delete(`/staff/${s.id}`);
                                setStaffList(staffList.filter((x) => x.id !== s.id));
                                toast.success('Deleted');
                              }}><Trash2 className="size-4" /></Button>
                            </>
                          ) : <span className="text-sm text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
