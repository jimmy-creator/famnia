import { Helmet } from 'react-helmet-async';
import { CURRENCY } from '../utils/currency';

const SITE_NAME = import.meta.env.VITE_STORE_NAME || 'Elegant Bayt';
const DEFAULT_DESC = import.meta.env.VITE_STORE_DESC || `Shop the latest products at great prices. Free shipping on orders over ${CURRENCY}500.`;
const SITE_URL = typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_SITE_URL || '');
const OG_IMAGE = import.meta.env.VITE_OG_IMAGE || '/images/hero-banner.jpeg';
const CURRENCY_CODE = import.meta.env.VITE_CURRENCY_CODE || 'QAR';

const cleanCanonical = () => {
  if (typeof window === 'undefined') return SITE_URL;
  // Strip query params (UTM, search filters, hashes) so canonical doesn't sprawl —
  // but keep `category`: category pages are canonical URLs in the sitemap.
  const category = new URLSearchParams(window.location.search).get('category');
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return `${window.location.origin}${window.location.pathname}${qs}`;
};

export default function SEO({
  title,
  description = DEFAULT_DESC,
  image,
  url,
  type = 'website',
  product,
  breadcrumbs,
}) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const canonicalUrl = url || cleanCanonical();
  const ogImage = image || `${SITE_URL}${OG_IMAGE}`;

  // Product JSON-LD
  const productSchema = product ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description?.slice(0, 5000),
    image: product.images?.length ? product.images : ogImage,
    sku: product.code || product.slug,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    offers: {
      '@type': 'Offer',
      price: parseFloat(product.price),
      priceCurrency: CURRENCY_CODE,
      availability: product.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: canonicalUrl,
    },
    ...(product.numReviews > 0 && product.ratings ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: parseFloat(product.ratings),
        reviewCount: product.numReviews,
      },
    } : {}),
  } : null;

  // Breadcrumb JSON-LD
  const breadcrumbSchema = breadcrumbs && breadcrumbs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: b.url?.startsWith('http') ? b.url : `${SITE_URL}${b.url || ''}`,
    })),
  } : null;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={product ? 'product' : type} />
      <meta property="og:site_name" content={SITE_NAME} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Product OG metadata (Facebook product feed) */}
      {product && (
        <>
          <meta property="product:price:amount" content={product.price} />
          <meta property="product:price:currency" content={CURRENCY_CODE} />
          <meta property="product:availability" content={product.stock > 0 ? 'in stock' : 'out of stock'} />
        </>
      )}

      <link rel="canonical" href={canonicalUrl} />

      {/* JSON-LD structured data */}
      {productSchema && (
        <script type="application/ld+json">{JSON.stringify(productSchema)}</script>
      )}
      {breadcrumbSchema && (
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      )}
    </Helmet>
  );
}
