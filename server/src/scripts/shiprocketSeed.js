/**
 * One-off bulk sync of every active Category + Product to Shiprocket's
 * Checkout database. Uses the same product/collection webhook endpoints
 * that services/shiprocketSync.js calls on edit — just iterates the whole
 * catalog at boot.
 *
 * Run on the VPS:
 *   cd /var/www/store3/server
 *   npm run shiprocket:seed
 *
 * Throttled to ~5 req/sec so we don't hammer SR. Logs per-row outcome and
 * a final summary. Failures are logged but do not abort the run.
 *
 * Required env (same as the live integration):
 *   SHIPROCKET_API_KEY
 *   SHIPROCKET_SECRET
 *   SHIPROCKET_BASE   (defaults to https://checkout-api.shiprocket.com)
 *   SITE_URL          (for building absolute image URLs)
 */
import 'dotenv/config';
import sequelize from '../config/database.js';
import { Product, Category } from '../models/index.js';
import { signedHeaders, SHIPROCKET_BASE, SHIPROCKET_API_KEY, SHIPROCKET_SECRET } from '../utils/shiprocketAuth.js';
import { encodeVariantId } from '../routes/shiprocket.js';

const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const DEFAULT_WEIGHT_KG = 0.1;
const DELAY_MS = 200; // ~5 req/sec

function absUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function num(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = parseFloat(v);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function buildProductPayload(p) {
  const obj = p.toJSON();
  const baseImage = obj.images?.[0] ? absUrl(obj.images[0]) : '';
  const hasVariants = Array.isArray(obj.variants) && obj.variants.length > 0;
  const variants = hasVariants
    ? obj.variants.map((v, idx) => ({
        id: encodeVariantId(obj.id, idx),
        title: Object.values(v.options || {}).join(' / ') || `Variant ${idx + 1}`,
        price: num(v.price, obj.price).toFixed(2),
        quantity: parseInt(num(v.stock, obj.stock, 0), 10),
        sku: v.sku || obj.code || `P${obj.id}-V${idx}`,
        updated_at: obj.updatedAt,
        image: { src: baseImage },
        weight: num(v.weight, obj.weight, DEFAULT_WEIGHT_KG),
      }))
    : [{
        id: encodeVariantId(obj.id, null),
        title: obj.name,
        price: num(obj.price).toFixed(2),
        quantity: parseInt(num(obj.stock, 0), 10),
        sku: obj.code || `P${obj.id}`,
        updated_at: obj.updatedAt,
        image: { src: baseImage },
        weight: num(obj.weight, DEFAULT_WEIGHT_KG),
      }];
  return {
    id: obj.id,
    title: obj.name,
    body_html: obj.description || '',
    vendor: obj.brand || '',
    product_type: obj.category || '',
    updated_at: obj.updatedAt,
    status: obj.active ? 'active' : 'draft',
    variants,
    image: { src: baseImage },
  };
}

function buildCollectionPayload(c) {
  const obj = c.toJSON();
  return {
    id: obj.id,
    title: obj.name,
    body_html: '',
    updated_at: obj.updatedAt,
    image: { src: obj.image ? absUrl(obj.image) : '' },
  };
}

async function push(path, payload, label) {
  const body = JSON.stringify(payload);
  try {
    const resp = await fetch(`${SHIPROCKET_BASE}${path}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    });
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 200); }
    if (!resp.ok || parsed?.ok === false) {
      console.log(`  ✗ ${label} — HTTP ${resp.status} ${parsed?.error?.message || parsed?.message || ''}`);
      return false;
    }
    console.log(`  ✓ ${label}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${label} — ${err.message}`);
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!SHIPROCKET_API_KEY || !SHIPROCKET_SECRET) {
    console.error('Missing SHIPROCKET_API_KEY / SHIPROCKET_SECRET in env. Aborting.');
    process.exit(1);
  }
  if (!SITE_URL) {
    console.error('Missing SITE_URL in env (needed for absolute image URLs). Aborting.');
    process.exit(1);
  }

  await sequelize.authenticate();

  // Categories first so products can reference them.
  console.log('— Collections —');
  const cats = await Category.findAll({ where: { active: true }, order: [['id', 'ASC']] });
  let cOk = 0, cFail = 0;
  for (const c of cats) {
    const ok = await push('/wh/v1/custom/collection', buildCollectionPayload(c), `[${c.id}] ${c.name}`);
    ok ? cOk++ : cFail++;
    await sleep(DELAY_MS);
  }

  console.log('\n— Products —');
  const products = await Product.findAll({ where: { active: true }, order: [['id', 'ASC']] });
  let pOk = 0, pFail = 0;
  for (const p of products) {
    const ok = await push('/wh/v1/custom/product', buildProductPayload(p), `[${p.id}] ${p.name}`);
    ok ? pOk++ : pFail++;
    await sleep(DELAY_MS);
  }

  console.log('\n— Summary —');
  console.log(`  Collections: ${cOk} synced, ${cFail} failed`);
  console.log(`  Products:    ${pOk} synced, ${pFail} failed`);

  await sequelize.close();
  process.exit(cFail + pFail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
