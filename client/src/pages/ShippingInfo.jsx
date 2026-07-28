import { Truck, Zap, Package, MapPin, Clock, HelpCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import SEO from '../components/SEO';
import { CURRENCY } from '../utils/currency';
import { cn } from '@/lib/utils';

const FAQS = [
  { q: 'Can I change my shipping address after placing an order?', a: 'You can update your shipping address within 2 hours of placing the order by contacting our support team. Once the order is shipped, address changes cannot be made.' },
  { q: 'Do you ship internationally?', a: "Currently, we only ship within Qatar. We're working on expanding to international shipping in the near future." },
  { q: "What happens if I'm not available to receive the delivery?", a: 'Our delivery partner will attempt delivery up to 3 times. If all attempts fail, the package will be returned to our warehouse and a refund will be initiated.' },
  { q: 'Is there a weight limit for shipping?', a: 'Standard and express shipping apply to orders up to 20kg. For heavier orders, additional charges may apply and will be displayed at checkout.' },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default function ShippingInfo() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <SEO title="Shipping Information" description={`Free shipping on orders over ${CURRENCY}500. Standard and express delivery across Qatar.`} />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="border-b border-border pb-6 text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Shipping Information</h1>
        <p className="mt-2 text-muted-foreground">Everything you need to know about our shipping and delivery.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { Icon: Truck, title: 'Standard Shipping', price: `${CURRENCY}49`, body: 'Delivered in 2-3 business days. Available for all orders across Qatar.' },
          { Icon: Zap, title: 'Express Shipping', price: `${CURRENCY}99`, body: 'Delivered in 1-2 business days. Get your order faster when you need it.' },
          { Icon: Package, title: 'Free Shipping', price: `${CURRENCY}0`, body: `Free standard shipping on all orders above ${CURRENCY}500. No code needed!`, highlight: true },
        ].map(({ Icon, title, price, body, highlight }) => (
          <div key={title} className={cn('rounded-lg border p-5', highlight ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
            <Icon className="size-6 text-primary" />
            <h3 className="mt-3 font-medium">{title}</h3>
            <p className="my-1 text-2xl font-semibold">{price}</p>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Delivery Coverage</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <h4 className="flex items-center gap-2 font-medium"><MapPin className="size-4 text-primary" /> Domestic Shipping</h4>
            <p className="mt-2 text-sm text-muted-foreground">We deliver across all of Qatar. Doha and nearby areas receive deliveries within 1-2 business days, while outlying areas may take 2-3 business days.</p>
          </div>
          <div>
            <h4 className="flex items-center gap-2 font-medium"><Clock className="size-4 text-primary" /> Processing Time</h4>
            <p className="mt-2 text-sm text-muted-foreground">Orders are processed within 24 hours of placement (excluding Fridays and public holidays). You&apos;ll receive a confirmation email with tracking details once your order ships.</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Tracking Your Order</h2>
        <p className="mt-3 text-sm text-muted-foreground">Once your order is shipped, you&apos;ll receive an email with your tracking number. You can track your order by:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Logging into your account and visiting &quot;My Orders&quot;</li>
          <li>Using the tracking number provided in your shipping confirmation email</li>
          <li>Contacting our support team with your order number</li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Frequently Asked Questions</h2>
        <div className="mt-4 flex flex-col gap-2">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="rounded-lg border border-border p-4">
              <summary className="flex cursor-pointer items-center gap-2 font-medium"><HelpCircle className="size-4 text-primary" /> {q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
