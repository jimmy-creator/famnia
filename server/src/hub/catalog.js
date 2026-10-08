import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  Product, ProductStock, Location, Order, Supplier, StockMovement, recomputeProductStock,
} from '../models/index.js';
import { withStockContext } from '../services/stockLedger.js';
import { loadAppSettings } from './settings.js';

/**
 * The hub's SKU view of the catalogue.
 *
 * The FEMNIA Hub design has one row per SKU (one size/colour). Here a SKU is a
 * product without variants, or one entry of a product's `variants` array.
 * Its key is `${productId}:${variantIndex}` (`base` when there are no
 * variants); variant indexes never change, because ProductStock rows and past
 * orders point at them — a removed variant is archived, never spliced out.
 */

export const SIZE_KEYS = ['size', 'size/age', 'age'];
export const COLOR_KEYS = ['color', 'colour', 'colour/variant', 'variant'];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (v) => Math.round(v * 100) / 100;

export function skuKey(productId, variantIndex) {
  return `${productId}:${variantIndex ?? 'base'}`;
}

export function parseKey(key) {
  const m = String(key || '').match(/^(\d+):(base|\d+)$/);
  if (!m) return null;
  return { productId: parseInt(m[1], 10), variantIndex: m[2] === 'base' ? null : parseInt(m[2], 10) };
}

function optionValue(options, keys) {
  if (!options || typeof options !== 'object') return null;
  for (const [k, v] of Object.entries(options)) {
    if (keys.includes(k.toLowerCase()) && v !== undefined && v !== null && String(v).trim()) return String(v);
  }
  return null;
}

export const hasVariants = (product) => Array.isArray(product.variants) && product.variants.length > 0;

/** Every live SKU of a product as { variantIndex, variant }. Archived variants are skipped. */
export function skuEntries(product) {
  if (!hasVariants(product)) return [{ variantIndex: null, variant: null }];
  return product.variants
    .map((variant, variantIndex) => ({ variantIndex, variant }))
    .filter(({ variant }) => variant && !variant.archived);
}

export function displaySku(product, variantIndex) {
  const v = variantIndex == null ? null : product.variants?.[variantIndex];
  if (v) return v.sku || `P${product.id}-${variantIndex + 1}`;
  return product.code || `P${product.id}`;
}

/** Values the hub reads per SKU: variant value when present, else the product's. */
export function skuFields(product, variantIndex) {
  const v = variantIndex == null ? null : product.variants?.[variantIndex] || null;
  const pick = (vk, pk = vk) => (v && v[vk] !== undefined && v[vk] !== null && v[vk] !== '' ? v[vk] : product[pk]);
  return {
    sku: displaySku(product, variantIndex),
    productCode: (v ? v.barcode : product.barcode) || null,
    size: v ? optionValue(v.options, SIZE_KEYS) : null,
    color: v ? optionValue(v.options, COLOR_KEYS) : null,
    costPrice: num(pick('costPrice')),
    sellingPrice: num(v && v.price !== null && v.price !== undefined && v.price !== '' ? v.price : product.price),
    rack: pick('rack') || null,
    shelfLocation: pick('shelfLocation') || null,
    reorderLevel: v && v.reorderLevel !== undefined && v.reorderLevel !== null ? v.reorderLevel : product.reorderLevel,
    notes: (v ? v.notes : product.notes) || null,
    isActive: Boolean(product.active) && !(v && (v.active === false || v.archived)),
    batchNumber: (v ? v.batchNumber : product.batchNumber) || null,
    sourceCountry: (v ? v.sourceCountry : product.sourceCountry) || null,
    wholesaler: (v ? v.wholesaler : product.wholesaler) || null,
  };
}

export const multilocOn = () => process.env.FEATURE_MULTILOC === 'true';

export async function stockSettings() {
  const { lowStockRule, reorderMultiplier } = await loadAppSettings();
  return { lowStockRule, reorderMultiplier };
}

export function stockStatusOf(current, reorderLevel) {
  if (current <= 0) return 'Out of Stock';
  if (current <= reorderLevel) return 'Low Stock';
  return 'In Stock';
}

// Ledger kind → inventory column.
const COLUMN = {
  opening: 'opening',
  stock_in: 'in', return: 'in', cancel_restock: 'in',
  sale: 'sale', sale_void: 'sale',
  stock_out: 'out', wastage: 'out', supplier_return: 'out',
};

/** Ledger totals per SKU key: { opening, in, sale, out, adj }. */
export async function ledgerTotals(productIds = null) {
  const rows = await StockMovement.findAll({
    attributes: ['productId', 'variantIndex', 'kind', [sequelize.fn('SUM', sequelize.col('quantity')), 'qty']],
    where: productIds ? { productId: productIds } : undefined,
    group: ['productId', 'variantIndex', 'kind'],
    raw: true,
  });
  const out = new Map();
  for (const r of rows) {
    const key = skuKey(r.productId, r.variantIndex);
    const t = out.get(key) || { opening: 0, in: 0, sale: 0, out: 0, adj: 0 };
    const col = COLUMN[r.kind] || 'adj';
    t[col] += parseInt(r.qty, 10) || 0;
    out.set(key, t);
  }
  return out;
}

/** Current stock per SKU key (all locations), or the legacy figures when multi-location is off. */
export async function currentStock(products) {
  const map = new Map();
  if (multilocOn()) {
    const rows = await ProductStock.findAll({
      attributes: ['productId', 'variantIndex', [sequelize.fn('SUM', sequelize.col('quantity')), 'qty']],
      where: { productId: products.map((p) => p.id) },
      group: ['productId', 'variantIndex'],
      raw: true,
    });
    for (const r of rows) map.set(skuKey(r.productId, r.variantIndex), parseInt(r.qty, 10) || 0);
    return map;
  }
  for (const p of products) {
    if (hasVariants(p)) p.variants.forEach((v, i) => map.set(skuKey(p.id, i), parseInt(v?.stock, 10) || 0));
    else map.set(skuKey(p.id, null), parseInt(p.stock, 10) || 0);
  }
  return map;
}

/** One SKU row in the shape the hub screens use. */
export function flattenSku(product, variantIndex, { totals, stock, settings, supplierName, showCost }) {
  const f = skuFields(product, variantIndex);
  const key = skuKey(product.id, variantIndex);
  const t = totals.get(key) || { opening: 0, in: 0, sale: 0, out: 0, adj: 0 };
  const current = stock.get(key) ?? 0;
  const reorderLevel = f.reorderLevel ?? settings.lowStockRule;
  const status = stockStatusOf(current, reorderLevel);
  const cost = showCost ? f.costPrice : 0;
  return {
    key,
    productId: product.id,
    variantIndex,
    sku: f.sku,
    productCode: f.productCode,
    name: product.name,
    rack: f.rack,
    category: product.category || null,
    size: f.size,
    color: f.color,
    designModel: product.designModel || null,
    brand: product.brand || null,
    openingStock: t.opening,
    stockIn: t.in,
    autoStockOut: -t.sale,
    manualStockOut: -t.out,
    adjustmentNet: t.adj,
    currentStock: current,
    costPrice: cost,
    sellingPriceQar: f.sellingPrice,
    profitPercent: cost > 0 ? round2(((f.sellingPrice - cost) / cost) * 100) : 0,
    shelfLocation: f.shelfLocation,
    reorderLevel,
    supplier: supplierName || null,
    imageUrl: (Array.isArray(product.images) && product.images[0]) || null,
    stockStatus: status,
    replenishQuantity: status === 'In Stock' ? 0 : Math.max(reorderLevel * settings.reorderMultiplier - current, 0),
    notes: f.notes,
    isActive: f.isActive,
    hideOnline: Boolean(product.hideOnline),
    batchNumber: f.batchNumber,
    sourceCountry: f.sourceCountry,
    wholesaler: f.wholesaler,
  };
}

/** Flattened SKU rows for the given products (all when omitted). */
export async function listSkus({ showCost, where } = {}) {
  const products = await Product.findAll({
    where,
    include: [{ model: Supplier, as: 'preferredSupplier', attributes: ['name'] }],
    order: [['name', 'ASC'], ['id', 'ASC']],
  });
  const [totals, stock, settings] = await Promise.all([
    ledgerTotals(where ? products.map((p) => p.id) : null),
    currentStock(products),
    stockSettings(),
  ]);
  const out = [];
  for (const p of products) {
    for (const { variantIndex } of skuEntries(p)) {
      out.push(flattenSku(p, variantIndex, {
        totals, stock, settings, supplierName: p.preferredSupplier?.name, showCost,
      }));
    }
  }
  return out;
}

/** Load the product behind a SKU key, or throw a 404-style error. */
export async function loadSku(key, options = {}) {
  const parsed = parseKey(key);
  const fail = () => Object.assign(new Error('This product no longer exists.'), { status: 404 });
  if (!parsed) throw fail();
  const product = await Product.findByPk(parsed.productId, {
    include: [{ model: Supplier, as: 'preferredSupplier', attributes: ['id', 'name'] }],
    ...options,
  });
  if (!product) throw fail();
  if (parsed.variantIndex !== null) {
    const v = product.variants?.[parsed.variantIndex];
    if (!hasVariants(product) || !v || v.archived) throw fail();
  } else if (hasVariants(product)) {
    throw fail();
  }
  return { product, variantIndex: parsed.variantIndex };
}

export async function skuRow(product, variantIndex, showCost) {
  const [totals, stock, settings] = await Promise.all([
    ledgerTotals([product.id]), currentStock([product]), stockSettings(),
  ]);
  return flattenSku(product, variantIndex, {
    totals, stock, settings, supplierName: product.preferredSupplier?.name, showCost,
  });
}

/** Sum of a SKU's stock across all locations. */
export async function skuStock(productId, variantIndex, transaction) {
  const sum = await ProductStock.sum('quantity', {
    where: { productId, variantIndex: variantIndex ?? { [Op.is]: null } },
    ...(transaction ? { transaction } : {}),
  });
  return parseInt(sum, 10) || 0;
}

/**
 * Where the hub's stock changes land: the online-default location, or the
 * only active one. The hub is single-store; with several branches Stock In
 * would be ambiguous, so it refuses rather than guess.
 */
export async function stockLocationId() {
  if (!multilocOn()) {
    throw Object.assign(new Error('Turn on multi-location inventory (FEATURE_MULTILOC) before recording stock in the hub.'), { status: 400 });
  }
  const online = await Location.findOne({ where: { isOnlineDefault: true, active: true }, attributes: ['id'] });
  if (online) return online.id;
  const all = await Location.findAll({ where: { active: true }, attributes: ['id'] });
  if (all.length === 1) return all[0].id;
  throw Object.assign(new Error(all.length
    ? 'Several store locations exist and none is the online default — set one in the classic ERP (Locations).'
    : 'No store location exists yet. Run the ERP setup (npm run seed:erp) first.'), { status: 400 });
}

/**
 * Change one SKU's stock by `delta` inside `transaction`, writing a ledger
 * movement described by `ctx`. Callers recompute Product.stock after commit.
 */
export async function applyStockDelta({ productId, variantIndex, delta, ctx, transaction, locationId = null }) {
  const loc = locationId ?? (await stockLocationId());
  return withStockContext(ctx, async () => {
    await ProductStock.findOrCreate({
      where: { productId, variantIndex: variantIndex ?? null, locationId: loc },
      defaults: { quantity: 0 },
      transaction,
    });
    const row = await ProductStock.findOne({
      where: { productId, variantIndex: variantIndex ?? { [Op.is]: null }, locationId: loc },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    if (delta) await row.update({ quantity: row.quantity + delta }, { transaction });
    return row;
  });
}

export async function recomputeAfter(productIds) {
  for (const id of new Set(productIds)) await recomputeProductStock(id);
}

/**
 * True when a SKU has anything recorded beyond its opening stock — any later
 * movement, or any order line. Locks size/colour changes and permanent delete.
 */
export async function skuLock(product, variantIndex) {
  const movements = await StockMovement.count({
    where: {
      productId: product.id,
      variantIndex: variantIndex ?? { [Op.is]: null },
      kind: { [Op.ne]: 'opening' },
    },
  });
  const sales = await StockMovement.count({
    where: { productId: product.id, variantIndex: variantIndex ?? { [Op.is]: null }, kind: 'sale' },
  });
  const orders = await ordersWithSku(product, variantIndex);
  const lock = {
    stockMovements: movements - sales,
    sales,
    confirmedOrders: orders,
    returns: 0,
    hasHistory: false,
  };
  lock.hasHistory = movements > 0 || orders > 0;
  return lock;
}

/** Count orders with a line for this SKU (items is JSON; web lines carry options, POS lines an index). */
export async function ordersWithSku(product, variantIndex) {
  const candidates = await Order.findAll({
    attributes: ['id', 'items'],
    where: sequelize.where(sequelize.cast(sequelize.col('items'), 'CHAR'), {
      [Op.like]: `%"productId":${product.id}%`,
    }),
  });
  let count = 0;
  for (const o of candidates) {
    const items = Array.isArray(o.items) ? o.items : [];
    const hit = items.some((it) => {
      if (Number(it.productId) !== product.id) return false;
      if (variantIndex == null) return true;
      if (it.variantIndex !== undefined && it.variantIndex !== null) return Number(it.variantIndex) === variantIndex;
      const sel = it.variant || it.selectedVariant;
      const opts = product.variants?.[variantIndex]?.options || {};
      return sel && Object.entries(opts).every(([k, val]) => sel[k] === val);
    });
    if (hit) count += 1;
  }
  return count;
}

/** All product codes and SKUs in use, for uniqueness checks. key → owner sku. */
export async function usedIdentifiers() {
  const products = await Product.findAll({ attributes: ['id', 'code', 'barcode', 'variants'] });
  const codes = new Map();
  const skus = new Map();
  for (const p of products) {
    if (hasVariants(p)) {
      p.variants.forEach((v, i) => {
        if (!v) return;
        const s = displaySku(p, i);
        if (v.barcode) codes.set(String(v.barcode), { sku: s, key: skuKey(p.id, i) });
        if (v.sku) skus.set(String(v.sku).toUpperCase(), { sku: s, key: skuKey(p.id, i) });
      });
      if (p.code) skus.set(String(p.code).toUpperCase(), { sku: p.code, key: skuKey(p.id, null) });
    } else {
      const s = displaySku(p, null);
      if (p.barcode) codes.set(String(p.barcode), { sku: s, key: skuKey(p.id, null) });
      if (p.code) skus.set(String(p.code).toUpperCase(), { sku: s, key: skuKey(p.id, null) });
    }
  }
  return { codes, skus };
}

/** "7" / "0007" → "0007"; throws on anything but digits. */
export function normalizeProductCode(raw) {
  const value = String(raw ?? '').trim();
  if (!value) throw Object.assign(new Error('Product Code is required.'), { status: 400 });
  if (!/^\d+$/.test(value)) throw Object.assign(new Error(`Product Code must contain digits only: ${value}`), { status: 400 });
  return value.replace(/^0+(?=\d)/, '').padStart(4, '0');
}

/** Next free four-digit-style codes. Long numeric barcodes (EAN-13 etc.) are ignored. */
export async function nextProductCodes(count) {
  const { codes } = await usedIdentifiers();
  let max = 0;
  for (const c of codes.keys()) if (/^\d{4,6}$/.test(c)) max = Math.max(max, parseInt(c, 10));
  return Array.from({ length: Math.max(0, count) }, (_, i) => String(max + 1 + i).padStart(4, '0'));
}

/** Find a supplier by name (case-insensitive) or create it; null for a blank name. */
export async function supplierByName(name, transaction) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const existing = await Supplier.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), clean.toLowerCase()),
    transaction,
  });
  if (existing) return existing;
  return Supplier.create({ name: clean }, { transaction });
}

export async function uniqueSlug(name, transaction) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
  let slug = base;
  for (let n = 2; await Product.findOne({ where: { slug }, attributes: ['id'], transaction }); n += 1) {
    slug = `${base}-${n}`;
  }
  return slug;
}

/** Recompute variantOptions from the live variants (keeps the storefront picker in sync). */
export function variantOptionsFrom(variants) {
  const opts = {};
  for (const v of variants) {
    if (!v || v.archived) continue;
    for (const [k, val] of Object.entries(v.options || {})) {
      if (val === undefined || val === null || val === '') continue;
      opts[k] = opts[k] || [];
      if (!opts[k].includes(val)) opts[k].push(val);
    }
  }
  return Object.keys(opts).length ? opts : null;
}
