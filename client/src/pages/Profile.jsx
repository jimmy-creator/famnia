import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, ShoppingBag, LogOut, Cog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Profile() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { wishlistCount } = useWishlist();
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    address: user?.address || '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.put('/auth/profile', form);
      localStorage.setItem('user', JSON.stringify(data));
      toast.success(t('profile.updated'));
    } catch {
      toast.error(t('profile.updateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const links = [
    { to: '/orders', icon: ShoppingBag, label: t('profile.myOrders') },
    { to: '/wishlist', icon: Heart, label: `${t('common.wishlist')}${wishlistCount > 0 ? ` (${wishlistCount})` : ''}` },
    ...(user?.role === 'admin' || user?.role === 'staff' ? [{ to: '/admin', icon: Cog, label: t('profile.adminPanel') }] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <h1 className="mb-6 font-serif text-3xl font-semibold tracking-tight">{t('profile.myAccount')}</h1>

      {/* Quick links */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {links.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <Icon className="size-5 text-primary" />
            <span>{label}</span>
          </Link>
        ))}
        <button
          onClick={logout}
          className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center text-sm font-medium transition-colors hover:border-destructive/40 hover:bg-accent"
        >
          <LogOut className="size-5 text-muted-foreground" />
          <span>{t('profile.logout')}</span>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t('profile.email')}</Label>
              <Input id="email" value={user?.email || ''} disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t('profile.fullName')}</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">{t('profile.phone')}</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="address">{t('profile.address')}</Label>
              <Textarea id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
            </div>
            <Button type="submit" disabled={loading} className="w-full sm:w-auto sm:self-start">
              {loading ? t('profile.saving') : t('profile.save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
