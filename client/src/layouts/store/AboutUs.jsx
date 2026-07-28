import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Award, Truck, ShieldCheck, Headphones, RefreshCw, Mail, Phone, MessageCircle } from 'lucide-react';
import StaticPage from './StaticPage';

const CONTACT_LINKS = (t) => [
  { href: 'mailto:info@elegantbayt.com', Icon: Mail, title: t('contact.emailUs'), lines: ['info@elegantbayt.com'] },
  { href: 'tel:+97470338065', Icon: Phone, title: t('contact.callUs'), lines: ['+974 7033 8065', '+974 5534 3471'] },
  { href: 'https://wa.me/97470338065', Icon: MessageCircle, title: t('contact.whatsapp'), lines: [t('contact.whatsappLine')] },
];

function ContactCards() {
  const { t } = useTranslation();
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {CONTACT_LINKS(t).map(({ href, Icon, title, lines }) => (
        <a
          key={href}
          href={href}
          target={href.startsWith('http') ? '_blank' : undefined}
          rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <Icon className="size-5" strokeWidth={1.6} />
          </span>
          <div className="not-prose">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <p className="text-sm text-muted-foreground">{lines.map((l, i) => <span key={i}>{l}{i < lines.length - 1 && <br />}</span>)}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

function ValueGrid({ items }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ Icon, title, body }) => (
        <div key={title} className="rounded-lg border border-border bg-card p-5">
          <Icon className="size-7 text-primary" strokeWidth={1.4} />
          <h3 className="mt-3 font-medium text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      ))}
    </div>
  );
}

function EnglishBody() {
  return (
    <>
      <section className="s2-static-section">
        <h2>Who We Are</h2>
        <p>
          Elegant Bayt is a Qatar-based home store built around a simple idea: a carefully chosen
          range of high-quality plastic home appliances — storage boxes, laundry baskets, dustbins,
          organizers, kitchenware and more — that bring convenience and elegance to everyday living.
        </p>
        <p>
          We focus on the things that matter: durable, well-made products, honest pricing, fast
          delivery across Qatar, and support that actually helps.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>What We Stand For</h2>
        <p>
          <strong>Genuine products.</strong> Everything we sell is sourced through authorised
          channels and arrives exactly as described.
        </p>
        <p>
          <strong>Honest pricing.</strong> Clear prices with no surprises at checkout.
        </p>
        <p>
          <strong>Looked after.</strong> Quick, protected delivery and easy returns if something
          isn&apos;t right.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>Why Shop With Us</h2>
        <ValueGrid items={[
          { Icon: ShoppingBag, title: 'Curated Selection', body: 'A focused range of quality products, chosen so you don’t have to wade through clutter.' },
          { Icon: Award, title: '100% Genuine', body: 'Authentic products sourced through authorised channels — sealed and as described.' },
          { Icon: Truck, title: 'Fast Delivery', body: 'Quick, protected shipping with free delivery above a minimum order value.' },
          { Icon: ShieldCheck, title: 'Secure Checkout', body: 'Multiple payment options with encrypted, secure payment processing.' },
          { Icon: RefreshCw, title: 'Easy Returns', body: 'Return unused items in their original packaging within 14 days.' },
          { Icon: Headphones, title: 'Real Support', body: 'Questions about an order or a product? Reach us and we’ll actually help.' },
        ]} />
      </section>

      <section className="s2-static-section">
        <h2>Get in Touch</h2>
        <p>
          Questions about a product or an order — reach us on our{' '}
          <Link to="/contact">contact page</Link> and we&apos;ll get back to you.
        </p>
        <ContactCards />
      </section>
    </>
  );
}

function ArabicBody() {
  return (
    <>
      <section className="s2-static-section">
        <h2>من نحن</h2>
        <p>
          Elegant Bayt متجر منزلي مقرّه قطر، قائم على فكرة بسيطة: تشكيلة مختارة بعناية من الأدوات
          المنزلية البلاستيكية عالية الجودة — صناديق تخزين، سلال غسيل، سلات مهملات، منظّمات،
          أدوات مطبخ وغيرها — تضيف الراحة والأناقة إلى حياتك اليومية.
        </p>
        <p>
          نركّز على ما يهمّ فعلًا: منتجات متينة حسنة الصنع، وأسعار صادقة، وتوصيل سريع في جميع
          أنحاء قطر، ودعم يساعدك حقًا.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>قيمنا</h2>
        <p>
          <strong>منتجات أصلية.</strong> كل ما نبيعه مصدره قنوات معتمدة ويصلك تمامًا كما هو موصوف.
        </p>
        <p>
          <strong>أسعار صادقة.</strong> أسعار واضحة دون مفاجآت عند الدفع.
        </p>
        <p>
          <strong>عناية كاملة.</strong> توصيل سريع ومحمي، وإرجاع سهل إذا لم يكن المنتج مناسبًا.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>لماذا تتسوق معنا</h2>
        <ValueGrid items={[
          { Icon: ShoppingBag, title: 'تشكيلة مختارة', body: 'مجموعة مركّزة من المنتجات عالية الجودة، اخترناها لك حتى لا تضيع وقتك في البحث.' },
          { Icon: Award, title: 'أصلية 100%', body: 'منتجات أصلية من قنوات معتمدة — مغلّفة وكما هي موصوفة تمامًا.' },
          { Icon: Truck, title: 'توصيل سريع', body: 'شحن سريع ومحمي مع توصيل مجاني للطلبات فوق الحد الأدنى.' },
          { Icon: ShieldCheck, title: 'دفع آمن', body: 'خيارات دفع متعددة مع معالجة مشفّرة وآمنة للمدفوعات.' },
          { Icon: RefreshCw, title: 'إرجاع سهل', body: 'أعِد المنتجات غير المستعملة في تغليفها الأصلي خلال 14 يومًا.' },
          { Icon: Headphones, title: 'دعم حقيقي', body: 'لديك سؤال عن طلب أو منتج؟ تواصل معنا وسنساعدك فعلًا.' },
        ]} />
      </section>

      <section className="s2-static-section">
        <h2>تواصل معنا</h2>
        <p>
          لأي استفسار عن منتج أو طلب — راسلنا عبر{' '}
          <Link to="/contact">صفحة التواصل</Link> وسنعود إليك بأقرب وقت.
        </p>
        <ContactCards />
      </section>
    </>
  );
}

export default function AboutUs() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="About Us"
      titleAr="من نحن"
      description="Elegant Bayt — premium plastic home appliances designed for durability, functionality and style, delivered across Qatar."
      descriptionAr="Elegant Bayt — أدوات منزلية بلاستيكية فاخرة مصمّمة للمتانة والعملية والأناقة، مع توصيل في جميع أنحاء قطر."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
