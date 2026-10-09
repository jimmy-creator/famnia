import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { HiPlus, HiPencil, HiTrash, HiPhotograph, HiX, HiEye, HiEyeOff, HiLogout } from 'react-icons/hi';
import { useTheme } from '../context/ThemeContext';
import { CURRENCY } from '../utils/currency';
import ProductsManager from '../components/admin/ProductsManager';
import CategoriesManager from '../components/admin/CategoriesManager';
import { Menu, LogOut, Plus, Pencil, Trash2, X, Eye, Search, Image as ImageIcon, Star, Check, Boxes } from 'lucide-react';
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

function HeroSealEditor() {
  const [seal, setSeal] = useState({ enabled: true, text: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/settings/hero-seal')
      .then((res) => { if (res.data) setSeal({ enabled: res.data.enabled !== false, text: res.data.text || '' }); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async (next) => {
    try {
      await api.put('/settings/hero-seal', next);
      setSeal(next);
      toast.success('Hero seal saved');
    } catch {
      toast.error('Failed to save hero seal');
    }
  };

  if (!loaded) return null;

  return (
    <div style={{ marginTop: '3rem' }}>
      <h3 style={{ fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '1rem' }}>
        Hero Seal
      </h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        The rotating circular badge on the home hero banner. Separate words with &middot; (e.g. &ldquo;Timeless &middot; Elegance&rdquo;). Keep it short — long text wraps around the circle and overlaps itself.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.88rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={seal.enabled}
          onChange={(e) => save({ ...seal, enabled: e.target.checked })}
        />
        Show the seal on the hero banner
      </label>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={seal.text}
          onChange={(e) => setSeal({ ...seal, text: e.target.value })}
          onBlur={() => save(seal)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(seal); } }}
          maxLength={60}
          placeholder="Timeless · Elegance"
          style={{ flex: 1, padding: '0.6rem 0.85rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.88rem', background: 'var(--bg-warm)' }}
        />
        <button type="button" onClick={() => save(seal)} className="btn btn-secondary">Save</button>
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

// Store-admin screens the FEMNIA Hub has no replacement for. In `embedded`
// mode (/hub/store) only these are offered, inside the hub shell.
const EMBED_TABS = ['abandoned', 'b2bquotes', 'reviews', 'coupons', 'theme']; // categories live in Catalogue → Categories

export default function Admin({ embedded = false, legacy = null }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { currentTheme, changeTheme, themes: themeOptions } = useTheme();

  const handleLogout = async () => {
    try { await logout(); } catch { /* clear client state regardless */ }
    navigate('/login');
  };
  const [tab, setTab] = useState(() => {
    if (embedded) {
      const wanted = new URLSearchParams(window.location.search).get('tab');
      return EMBED_TABS.includes(wanted) ? wanted : 'abandoned';
    }
    if (user?.role === 'staff' && user?.permissions?.length > 0) {
      const permToTab = { analytics: 'dashboard', products: 'products', orders: 'orders', categories: 'categories', customers: 'customers', coupons: 'coupons', reviews: 'reviews', settings: 'theme' };
      return permToTab[user.permissions[0]] || 'dashboard';
    }
    return 'dashboard';
  });
  const [products, setProducts] = useState([]);
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
    } else if (tab === 'orders') {
      api.get('/orders/all?limit=50').then((res) => setOrders(res.data.orders));
    } else if (tab === 'coupons') {
      api.get('/coupons').then((res) => setCoupons(res.data));
      if (products.length === 0) api.get('/products/admin/all?limit=10000').then((res) => setProducts(res.data.products));
      if (adminCategories.length === 0) api.get('/categories/all').then((res) => setAdminCategories(res.data));
      if (availableGateways.length === 0) api.get('/payment/gateways').then((res) => setAvailableGateways(res.data));
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
    }
  }, [tab, chartPeriod, customerSearch, pincodeSearch, abandonedFilter, b2bStatusFilter]);

  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const userPerms = user?.permissions || [];

  const hasAccess = (perm) => isAdmin || userPerms.includes(perm) || Boolean(legacy?.includes(perm));

  // ─── Sidebar nav structure ──────────────────────────────────────
  // `show` is computed per render so role/feature gating stays live.
  const ALL_NAV_SECTIONS = [
    { id: 'catalog', label: 'Catalog', items: [
        { tab: 'products',   label: 'Products',   show: hasAccess('products') },
        { tab: 'categories', label: 'Categories', show: hasAccess('categories') },
    ]},
    { id: 'sales', label: 'Sales', items: [
        { tab: 'orders',    label: 'Orders',     show: hasAccess('orders') },
        { tab: 'abandoned', label: 'Abandoned',  show: hasAccess('orders') },
        { tab: 'b2bquotes', label: 'B2B Quotes', show: hasAccess('orders') },
    ]},
    { id: 'people', label: 'People', items: [
        { tab: 'customers', label: 'Customers', show: hasAccess('customers') },
        { tab: 'reviews',   label: 'Reviews',   show: hasAccess('reviews') },
        { tab: 'staff',     label: 'Staff',     show: isAdmin },
    ]},
    { id: 'settings', label: 'Settings', items: [
        { tab: 'coupons',  label: 'Coupons',  show: hasAccess('coupons') },
        { tab: 'pincodes', label: 'Pincodes', show: false },
        { tab: 'theme',    label: 'Theme',    show: hasAccess('settings') },
    ]},
  ];
  const NAV_SECTIONS = embedded
    ? ALL_NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => EMBED_TABS.includes(i.tab)) }))
    : ALL_NAV_SECTIONS;

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
    <div className={embedded ? 'hub-legacy' : 'min-h-screen bg-background'}>
      {/* On desktop the shell is pinned to the viewport and the sidebar and
          content scroll independently — the nav list is long enough that a
          single page scroll would carry the content away while reaching for
          an item near the bottom. Mobile keeps normal page scrolling, where
          the sidebar is an overlay that already scrolls on its own. */}
      <div className={embedded ? '' : 'mx-auto flex min-h-screen max-w-[1600px] lg:h-screen lg:min-h-0 lg:overflow-hidden'}>
        {!embedded && (<>
        {/* Mobile top bar */}
        <button
          className="fixed left-0 right-0 top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-4 py-3 text-sm font-medium backdrop-blur lg:hidden"
          onClick={() => setSidebarOpen((s) => !s)}
        >
          <Menu className="size-5" /> {activeLabel || 'Menu'}
        </button>
        {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* The title and Logout stay pinned; only the nav list between them
            scrolls, so Logout is always reachable however long the nav grows. */}
        <aside className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-card p-3 transition-transform lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}>
          <div className="shrink-0 px-3 py-3 font-serif text-xl font-semibold tracking-wide">Admin</div>
          {/* min-h-0 is required: without it a flex child won't shrink below
              its content height and the list would overflow instead of scroll. */}
          <nav className="min-h-0 flex-1 overflow-y-auto">
          {hasAccess('analytics') && (
            <button
              className={cn(
                'block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent',
                tab === 'dashboard' && 'bg-primary/10 text-primary',
              )}
              onClick={() => setTab('dashboard')}>
              Dashboard
            </button>
          )}
          {/* Inventory, purchasing, finance and POS reporting
              live on their own page — together they outnumbered the store
              tabs and made this sidebar unscannable. */}
          {(hasAccess('products') || hasAccess('analytics')) && (
            <button
              className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-accent"
              onClick={() => navigate('/admin/erp')}>
              <Boxes className="size-4" /> ERP Back Office
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
          </nav>
          <button
            className="mt-3 flex shrink-0 items-center gap-2 border-t border-border px-3 pt-3 text-sm text-destructive transition-colors hover:bg-accent"
            onClick={handleLogout}
          >
            <LogOut className="size-4" /> Logout{user?.name ? ` (${user.name})` : ''}
          </button>
        </aside>
        </>)}

        <main className={embedded ? 'min-w-0' : 'min-w-0 flex-1 px-4 pb-16 pt-16 lg:h-screen lg:overflow-y-auto lg:px-8 lg:pt-8'}>
          {embedded ? (
            <nav className="hub-legacy-nav mb-5 flex flex-wrap gap-1.5">
              {NAV_SECTIONS.flatMap((s) => s.items).filter((i) => i.show).map((i) => (
                <button
                  key={i.tab}
                  className={cn('hub-legacy-pill', tab === i.tab && 'is-active')}
                  onClick={() => setTab(i.tab)}
                >
                  {i.label}
                </button>
              ))}
            </nav>
          ) : (
            <h1 className="mb-6 font-serif text-2xl font-semibold tracking-tight">Admin Panel</h1>
          )}

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

        {tab === 'products' && <ProductsManager />}

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

        {tab === 'categories' && <CategoriesManager />}

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

            {/* Hero seal — rotating circular badge on the home hero banner */}
            <HeroSealEditor />

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
