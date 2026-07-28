import { Router } from 'express';
import { Product, Category } from '../models/index.js';

const router = Router();

router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = process.env.CLIENT_URL || `https://${req.headers.host}`;
    const I18N_ON = process.env.FEATURE_I18N === 'true';   // stores that mirror /ar/*

    const products = await Product.findAll({
      where: { active: true },
      attributes: ['slug', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
    });

    const categories = await Category.findAll({
      where: { active: true },
      attributes: ['name'],
    });

    // For i18n stores, emit each URL as one <url> with two
    // <xhtml:link rel="alternate" hreflang> entries (canonical + AR).
    // The xhtml namespace is the standard way to declare alternates
    // inside a sitemap.
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
    if (I18N_ON) xml += ' xmlns:xhtml="http://www.w3.org/1999/xhtml"';
    xml += '>\n';

    const emit = (path, { changefreq, priority, lastmod } = {}) => {
      const en = `${baseUrl}${path}`;
      const ar = `${baseUrl}/ar${path === '/' ? '' : path}`;
      xml += `  <url>\n`;
      xml += `    <loc>${en}</loc>\n`;
      if (lastmod) xml += `    <lastmod>${lastmod}</lastmod>\n`;
      if (changefreq) xml += `    <changefreq>${changefreq}</changefreq>\n`;
      if (priority) xml += `    <priority>${priority}</priority>\n`;
      if (I18N_ON) {
        xml += `    <xhtml:link rel="alternate" hreflang="en" href="${en}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${ar}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />\n`;
      }
      xml += `  </url>\n`;
      // Emit the Arabic URL as its own entry too so it gets crawled.
      if (I18N_ON) {
        xml += `  <url>\n`;
        xml += `    <loc>${ar}</loc>\n`;
        if (lastmod) xml += `    <lastmod>${lastmod}</lastmod>\n`;
        if (changefreq) xml += `    <changefreq>${changefreq}</changefreq>\n`;
        if (priority) xml += `    <priority>${priority}</priority>\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="en" href="${en}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="ar" href="${ar}" />\n`;
        xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${en}" />\n`;
        xml += `  </url>\n`;
      }
    };

    const staticPages = [
      { loc: '/', priority: '1.0', changefreq: 'daily' },
      { loc: '/products', priority: '0.9', changefreq: 'daily' },
      { loc: '/about', priority: '0.5', changefreq: 'monthly' },
      { loc: '/contact', priority: '0.5', changefreq: 'monthly' },
      { loc: '/shipping-info', priority: '0.5', changefreq: 'monthly' },
      { loc: '/shipping-policy', priority: '0.4', changefreq: 'monthly' },
      { loc: '/return-policy', priority: '0.4', changefreq: 'monthly' },
      { loc: '/refund-policy', priority: '0.4', changefreq: 'monthly' },
      { loc: '/privacy-policy', priority: '0.3', changefreq: 'yearly' },
      { loc: '/terms', priority: '0.3', changefreq: 'yearly' },
    ];
    for (const p of staticPages) emit(p.loc, p);

    for (const cat of categories) {
      emit(`/products?category=${encodeURIComponent(cat.name)}`, { priority: '0.8', changefreq: 'weekly' });
    }

    for (const product of products) {
      emit(`/product/${product.slug}`, {
        priority: '0.7',
        changefreq: 'weekly',
        lastmod: product.updatedAt.toISOString().split('T')[0],
      });
    }

    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    res.status(500).send('Error generating sitemap');
  }
});

// robots.txt
router.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.CLIENT_URL || `https://${req.headers.host}`;
  const txt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /checkout
Disallow: /profile
Disallow: /orders
Disallow: /cart
Disallow: /wishlist
Disallow: /order-success

Sitemap: ${baseUrl}/sitemap.xml
`;
  res.set('Content-Type', 'text/plain');
  res.send(txt);
});

export default router;
