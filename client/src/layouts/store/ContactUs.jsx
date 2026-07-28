import { useState } from 'react';
import { Mail, Send, Phone, MessageCircle, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import SEO from '../../components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Elegant Bayt';

export default function ContactUs() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);

  const contactCards = [
    { href: 'mailto:info@elegantbayt.com', Icon: Mail, title: t('contact.emailUs'), lines: ['info@elegantbayt.com'] },
    { href: 'tel:+97470338065', Icon: Phone, title: t('contact.callUs'), lines: ['+974 7033 8065', '+974 5534 3471'] },
    { href: 'https://wa.me/97470338065', Icon: MessageCircle, title: t('contact.whatsapp'), lines: [t('contact.whatsappLine')] },
    { href: 'https://www.google.com/maps/search/?api=1&query=5C6J%2BJMG%20Ar-Rayyan%20Qatar', Icon: MapPin, title: t('contact.visitUs'), lines: ['5C6J+JMG, Ar-Rayyan, Qatar'] },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/contact/send', form);
      toast.success(t('contact.sent'));
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || t('contact.failed'));
    } finally {
      setLoading(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
      <SEO title={`Contact Us — ${STORE_NAME}`} description={`Get in touch with ${STORE_NAME}. Questions about products, orders or bulk enquiries — we're here to help.`} />

      <div className="mb-12 text-center">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{t('contact.kicker')}</p>
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          {t('contact.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          {t('contact.desc')}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        {/* Contact cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {contactCards.map(({ href, Icon, title, lines }) => (
            <a
              key={title}
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <Icon className="size-5" strokeWidth={1.6} />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-foreground">{title}</h4>
                <p className="text-sm text-muted-foreground">
                  {lines.map((l, i) => <span key={i}>{l}{i < lines.length - 1 && <br />}</span>)}
                </p>
              </div>
            </a>
          ))}
        </div>

        {/* Contact form */}
        <form className="rounded-lg border border-border bg-card p-6" onSubmit={handleSubmit}>
          <h3 className="mb-5 font-serif text-2xl font-semibold">{t('contact.sendMessage')}</h3>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-name">{t('contact.name')}</Label>
                <Input id="c-name" value={form.name} onChange={set('name')} placeholder={t('contact.namePlaceholder')} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-email">{t('contact.email')}</Label>
                <Input id="c-email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="c-subject">{t('contact.subject')}</Label>
              <Input id="c-subject" value={form.subject} onChange={set('subject')} placeholder={t('contact.subjectPlaceholder')} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="c-message">{t('contact.message')}</Label>
              <Textarea id="c-message" rows={5} value={form.message} onChange={set('message')} placeholder={t('contact.messagePlaceholder')} required />
            </div>
            <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
              <Send className="size-4" /> {loading ? t('contact.sending') : t('contact.send')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
