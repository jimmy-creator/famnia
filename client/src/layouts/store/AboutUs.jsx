import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingBag, Award, Truck, ShieldCheck, Headphones, RefreshCw, Mail, Phone, MessageCircle } from 'lucide-react';
import StaticPage from './StaticPage';

const CONTACT_LINKS = (t) => [
  { href: 'mailto:info@femnia.com', Icon: Mail, title: t('contact.emailUs'), lines: ['info@femnia.com'] },
  { href: 'tel:+97466543343', Icon: Phone, title: t('contact.callUs'), lines: ['+974 6654 3343'] },
  { href: 'https://wa.me/97466543343', Icon: MessageCircle, title: t('contact.whatsapp'), lines: [t('contact.whatsappLine')] },
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
          Femnia Fashion is a Qatar-based womenswear label built around a simple idea: a carefully
          chosen wardrobe of timeless pieces — dresses, tops, tailoring and accessories — cut from
          good fabric and made to outlast the season.
        </p>
        <p>
          We focus on the things that matter: considered design, quality fabrics, honest pricing,
          fast delivery across Qatar, and support that actually helps.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>What We Stand For</h2>
        <p>
          <strong>Pieces that last.</strong> We choose fabric and construction over trend cycles, so
          what you buy still works two seasons from now.
        </p>
        <p>
          <strong>Honest pricing.</strong> Clear prices with no surprises at checkout.
        </p>
        <p>
          <strong>Looked after.</strong> Quick, protected delivery and easy returns if the fit
          isn&apos;t right.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>Why Shop With Us</h2>
        <ValueGrid items={[
          { Icon: ShoppingBag, title: 'Curated Wardrobe', body: 'A focused edit of pieces that work together, so you don’t have to wade through clutter.' },
          { Icon: Award, title: 'Quality Fabrics', body: 'Linen, silk, cotton and fine knits — chosen for how they wear, drape and last.' },
          { Icon: Truck, title: 'Fast Delivery', body: 'Quick, protected shipping with free delivery above a minimum order value.' },
          { Icon: ShieldCheck, title: 'Secure Checkout', body: 'Multiple payment options with encrypted, secure payment processing.' },
          { Icon: RefreshCw, title: 'Easy Returns', body: 'Return unworn items with tags attached within 14 days.' },
          { Icon: Headphones, title: 'Real Support', body: 'Questions on sizing, fit or an order? Reach us and we’ll actually help.' },
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
          Femnia Fashion علامة أزياء نسائية مقرّها قطر، قائمة على فكرة بسيطة: خزانة مختارة بعناية
          من القطع الخالدة — فساتين، بلوزات، تفصيل، وإكسسوارات — من أقمشة جيدة وصناعة تدوم
          أكثر من موسم.
        </p>
        <p>
          نركّز على ما يهمّ فعلًا: تصميم مدروس، وأقمشة عالية الجودة، وأسعار صادقة، وتوصيل سريع
          في جميع أنحاء قطر، ودعم يساعدك حقًا.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>قيمنا</h2>
        <p>
          <strong>قطع تدوم.</strong> نختار القماش والصناعة بدل موجات الموضة، ليبقى ما تشترينه
          مناسبًا بعد موسمين.
        </p>
        <p>
          <strong>أسعار صادقة.</strong> أسعار واضحة دون مفاجآت عند الدفع.
        </p>
        <p>
          <strong>عناية كاملة.</strong> توصيل سريع ومحمي، وإرجاع سهل إذا لم يكن المقاس مناسبًا.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>لماذا تتسوق معنا</h2>
        <ValueGrid items={[
          { Icon: ShoppingBag, title: 'خزانة مختارة', body: 'تشكيلة مركّزة من القطع التي تتكامل معًا، اخترناها لك حتى لا تضيع وقتك في البحث.' },
          { Icon: Award, title: 'أقمشة عالية الجودة', body: 'كتان وحرير وقطن وتريكو ناعم — مختارة لملمسها وانسدالها ومتانتها.' },
          { Icon: Truck, title: 'توصيل سريع', body: 'شحن سريع ومحمي مع توصيل مجاني للطلبات فوق الحد الأدنى.' },
          { Icon: ShieldCheck, title: 'دفع آمن', body: 'خيارات دفع متعددة مع معالجة مشفّرة وآمنة للمدفوعات.' },
          { Icon: RefreshCw, title: 'إرجاع سهل', body: 'أعِدي القطع غير الملبوسة مع بطاقاتها خلال 14 يومًا.' },
          { Icon: Headphones, title: 'دعم حقيقي', body: 'لديك سؤال عن المقاس أو الطلب؟ تواصلي معنا وسنساعدك فعلًا.' },
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
      description="Femnia Fashion — timeless womenswear and accessories designed for quality, fit and everyday elegance, delivered across Qatar."
      descriptionAr="Femnia Fashion — أزياء نسائية خالدة وإكسسوارات مصمّمة للجودة والمقاس والأناقة اليومية، مع توصيل في جميع أنحاء قطر."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
