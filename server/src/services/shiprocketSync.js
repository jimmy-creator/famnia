/**
 * Real-time catalog sync TO Shiprocket on Product / Category save.
 *
 * Sequelize lifecycle hooks: when Admin saves a product or category, we
 * push the change to Shiprocket's webhook so their checkout stays in sync.
 *
 * Fire-and-forget: failures are logged but never block the local save.
 * Disabled automatically if SHIPROCKET_API_KEY / SHIPROCKET_SECRET aren't set.
 */
import { Product, Category } from '../models/index.js';
import { signedHeaders, SHIPROCKET_BASE, SHIPROCKET_API_KEY, SHIPROCKET_SECRET } from '../utils/shiprocketAuth.js';
import { encodeVariantId } from '../routes/shiprocket.js';
import { parseWeightFromOptions } from '../utils/productWeight.js';

const SITE_URL = (process.env.SITE_URL || process.env.CLIENT_URL || '').replace(/\/$/, '');
const DEFAULT_WEIGHT_KG = 0.1;
const ENABLED = !!(SHIPROCKET_API_KEY && SHIPROCKET_SECRET);

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

function buildProductPayload(product) {
  const obj = product.toJSON ? product.toJSON() : product;
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
        weight: num(v.weight, parseWeightFromOptions(v.options), obj.weight, DEFAULT_WEIGHT_KG),
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

function buildCollectionPayload(category) {
  const obj = category.toJSON ? category.toJSON() : category;
  return {
    id: obj.id,
    title: obj.name,
    body_html: '',
    updated_at: obj.updatedAt,
    image: { src: obj.image ? absUrl(obj.image) : '' },
  };
}

async function pushToShiprocket(path, payload) {
  if (!ENABLED) return;
  try {
    const body = JSON.stringify(payload);
    const resp = await fetch(`${SHIPROCKET_BASE}${path}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn(`[shiprocketSync] ${path} ${resp.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[shiprocketSync] ${path} failed: ${err.message}`);
  }
}

export function registerShiprocketHooks() {
  if (!ENABLED) {
    console.log('[shiprocketSync] disabled (no SHIPROCKET_API_KEY / SHIPROCKET_SECRET)');
    return;
  }

  Product.afterCreate((product) => {
    pushToShiprocket('/wh/v1/custom/product', buildProductPayload(product));
  });
  Product.afterUpdate((product) => {
    pushToShiprocket('/wh/v1/custom/product', buildProductPayload(product));
  });
  // Soft-delete via active=false is handled by afterUpdate (status becomes draft).

  Category.afterCreate((category) => {
    pushToShiprocket('/wh/v1/custom/collection', buildCollectionPayload(category));
  });
  Category.afterUpdate((category) => {
    pushToShiprocket('/wh/v1/custom/collection', buildCollectionPayload(category));
  });

  console.log('[shiprocketSync] hooks registered — product/category updates will push to Shiprocket');
}
