import { Router } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import {
  Product, ProductStock, StockMovement, ProductAuditLog, ImportBatch, Supplier, User,
} from '../models/index.js';
import { protect } from '../middleware/auth.js';
import { HUB_ROLES } from '../hub/permissions.js';
import { bad, can, hubLog, need, wrap as wrapAs } from '../hub/http.js';
import {
  applyStockDelta, displaySku, hasVariants, listSkus, loadSku, nextProductCodes, normalizeProductCode,
  recomputeAfter, skuEntries, skuFields, skuKey, skuLock, skuRow, skuStock, supplierByName, uniqueSlug,
  usedIdentifiers, variantOptionsFrom, SIZE_KEYS, COLOR_KEYS,
} from '../hub/catalog.js';
import { todayLocal } from '../services/stockLedger.js';

/**
 * FEMNIA Hub catalogue & stock: Products, Inventory, Stock In, Stock Out,
 * adjustments, batches, suppliers and the hub's spreadsheet import.
 *
 * Stock is only ever changed through applyStockDelta(), which writes the
 * ProductStock row and (via the model hook) a StockMovement carrying the
 * details shown on these screens.
 */
const router = Router();

// ── plumbing ────────────────────────────────────────────────────────
const wrap = (fn) => wrapAs('hubCatalog', fn);
const clean = (v) => {
  const s = v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim();
  return s || null;
};
const money = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
};
const dateOnly = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : todayLocal());
const randomSuffix = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const stamp = () => todayLocal().replace(/-/g, '');

async function audit(product, variantIndex, sku, changes, userId, transaction) {
  if (!changes.length) return;
  await ProductAuditLog.bulkCreate(changes.map((c) => ({
    productId: product.id,
    variantIndex,
    sku,
    field: c.field,
    oldValue: c.oldValue ?? null,
    newValue: c.newValue ?? null,
    changedBy: userId,
  })), { transaction });
}

const VIEW_SKUS = ['products.view', 'inventory.view', 'orders.create', 'inventory.stock_in', 'inventory.stock_out',
  'products.barcodes', 'imports.new_products', 'imports.stock_in', 'imports.mixed'];

const TYPE_LABELS = {
  opening: 'Opening Stock',
  stock_in: 'Stock In',
  sale: 'Sale',
  sale_void: 'Sale Void',
  return: 'Return',
  cancel_restock: 'Cancellation Restock',
  stock_out: 'Manual Stock Out',
  wastage: 'Wastage',
  supplier_return: 'Supplier Return',
  adjustment: 'Adjustment',
  count: 'Stock Count',
  transfer: 'Transfer',
  import: 'Import',
  other: 'Adjustment',
};

async function namesById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await User.findAll({ where: { id: unique }, attributes: ['id', 'name', 'email'] });
  return new Map(users.map((u) => [u.id, u.name || u.email || null]));
}

/** SKU details (name, category, size, colour, sku) for movement rows. */
async function skuDetails(rows) {
  const ids = [...new Set(rows.map((r) => r.productId))];
  const products = ids.length ? await Product.findAll({ where: { id: ids } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return (productId, variantIndex) => {
    const p = byId.get(productId);
    if (!p) return { key: skuKey(productId, variantIndex), sku: `P${productId}`, name: `Product #${productId}`, category: null, size: null, color: null };
    const f = skuFields(p, variantIndex);
    return { key: skuKey(productId, variantIndex), sku: f.sku, name: p.name, category: p.category || null, size: f.size, color: f.color };
  };
}

// ── batches ─────────────────────────────────────────────────────────
const batchLabel = (batchNumber, sourceCountry) => [batchNumber, sourceCountry].filter(Boolean).join(' ') || 'No batch recorded';

function groupBatches(opening, receipts) {
  const groups = new Map();
  const add = (b, c, w, quantity, date, source) => {
    if (!b && !c && !w) return;
    const key = `${b ?? ''}|${c ?? ''}|${w ?? ''}`;
    const found = groups.get(key);
    if (found) {
      found.receivedQuantity += quantity;
      if (date && (!found.firstDate || date < found.firstDate)) found.firstDate = date;
      if (found.source !== source) found.source = 'Opening Stock + Stock In';
      return;
    }
    groups.set(key, {
      key, batchNumber: b, sourceCountry: c, wholesaler: w, receivedQuantity: quantity, firstDate: date, source,
      label: batchLabel(b, c),
    });
  };
  if (opening) add(opening.batchNumber, opening.sourceCountry, opening.wholesaler, opening.quantity, opening.date, 'Opening Stock');
  for (const r of receipts) add(r.batchNumber, r.sourceCountry, r.wholesaler, r.quantity, r.txnDate, 'Stock In');
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// ════════════════════════════════════════════════════════════════════
// Products / SKUs
// ════════════════════════════════════════════════════════════════════
router.use(protect);

router.get('/skus', need(...VIEW_SKUS), wrap(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await listSkus({ showCost: can(req, 'products.view_cost') }));
}));

router.get('/skus/:key', need(...VIEW_SKUS), wrap(async (req, res) => {
  const { product, variantIndex } = await loadSku(req.params.key);
  const row = await skuRow(product, variantIndex, can(req, 'products.view_cost'));
  const moves = await StockMovement.findAll({
    where: { productId: product.id, variantIndex: variantIndex ?? { [Op.is]: null } },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: 100,
  });
  res.json({
    product: row,
    history: moves.map((m) => ({
      id: m.id,
      type: TYPE_LABELS[m.kind] || 'Adjustment',
      reference: m.reference || TYPE_LABELS[m.kind] || '—',
      date: m.txnDate,
      sku: row.sku,
      quantity: m.quantity,
      note: m.reason || m.notes || null,
    })),
  });
}));

router.get('/skus/:key/history', need('inventory.view_history'), wrap(async (req, res) => {
  const { product, variantIndex } = await loadSku(req.params.key);
  const [moves, changes] = await Promise.all([
    StockMovement.findAll({
      where: { productId: product.id, variantIndex: variantIndex ?? { [Op.is]: null } },
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
    }),
    ProductAuditLog.findAll({
      where: { productId: product.id, variantIndex: variantIndex ?? { [Op.is]: null } },
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    }),
  ]);
  const names = await namesById([...moves.map((m) => m.createdBy), ...changes.map((c) => c.changedBy)]);
  let running = 0;
  const movements = moves.map((m) => {
    const before = running;
    running += m.quantity;
    return {
      id: m.id,
      date: m.txnDate,
      type: TYPE_LABELS[m.kind] || 'Adjustment',
      reference: m.reference || '—',
      quantityChange: m.quantity,
      quantityBefore: before,
      quantityAfter: running,
      reason: m.reason || null,
      notes: m.notes || null,
      supplier: m.supplier || null,
      cost: m.unitCost === null ? null : parseFloat(m.unitCost),
      by: m.createdBy ? names.get(m.createdBy) ?? null : null,
    };
  }).reverse();
  res.json({
    movements,
    fieldChanges: changes.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changedBy: c.changedBy,
      changedByName: c.changedBy ? names.get(c.changedBy) ?? null : null,
    })),
  });
}));

router.get('/skus/:key/lock', need('products.edit', 'products.deactivate'), wrap(async (req, res) => {
  const { product, variantIndex } = await loadSku(req.params.key);
  res.json(await skuLock(product, variantIndex));
}));

router.get('/skus/:key/batches', need(...VIEW_SKUS), wrap(async (req, res) => {
  const { product, variantIndex } = await loadSku(req.params.key);
  const f = skuFields(product, variantIndex);
  const moves = await StockMovement.findAll({
    where: { productId: product.id, variantIndex: variantIndex ?? { [Op.is]: null }, kind: ['opening', 'stock_in'] },
    order: [['txnDate', 'ASC']],
  });
  const openingQty = moves.filter((m) => m.kind === 'opening').reduce((s, m) => s + m.quantity, 0);
  res.json(groupBatches(
    { batchNumber: f.batchNumber, sourceCountry: f.sourceCountry, wholesaler: f.wholesaler, quantity: openingQty, date: String(product.createdAt.toISOString?.() ?? product.createdAt).slice(0, 10) },
    moves.filter((m) => m.kind === 'stock_in'),
  ));
}));

/** Every recorded batch per SKU key — labels ("Batch 1 UAE") for exports, numbers for the barcode filter. */
router.get('/batches', need(...VIEW_SKUS), wrap(async (req, res) => {
  const [products, receipts] = await Promise.all([
    Product.findAll({ attributes: ['id', 'code', 'variants', 'batchNumber', 'sourceCountry', 'wholesaler'] }),
    StockMovement.findAll({
      where: { kind: 'stock_in', [Op.or]: [{ batchNumber: { [Op.ne]: null } }, { sourceCountry: { [Op.ne]: null } }] },
      attributes: ['productId', 'variantIndex', 'batchNumber', 'sourceCountry'],
      raw: true,
    }),
  ]);
  const labels = {};
  const numbers = {};
  const add = (key, b, c) => {
    if (b || c) (labels[key] = labels[key] || new Set()).add(batchLabel(b, c));
    if (b && String(b).trim()) (numbers[key] = numbers[key] || new Set()).add(String(b).trim());
  };
  for (const p of products) {
    for (const { variantIndex } of skuEntries(p)) {
      const f = skuFields(p, variantIndex);
      add(skuKey(p.id, variantIndex), f.batchNumber, f.sourceCountry);
    }
  }
  for (const r of receipts) add(skuKey(r.productId, r.variantIndex), r.batchNumber, r.sourceCountry);
  const out = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, [...v].sort()]));
  res.json({ labels: out(labels), numbers: out(numbers) });
}));

router.get('/suppliers', need(...VIEW_SKUS), wrap(async (req, res) => {
  const [suppliers, moves] = await Promise.all([
    Supplier.findAll({ where: { active: true }, attributes: ['name'], raw: true }),
    StockMovement.findAll({
      attributes: ['supplier', 'wholesaler'],
      where: { [Op.or]: [{ supplier: { [Op.ne]: null } }, { wholesaler: { [Op.ne]: null } }] },
      group: ['supplier', 'wholesaler'],
      raw: true,
    }),
  ]);
  const names = new Set();
  for (const s of suppliers) if (s.name?.trim()) names.add(s.name.trim());
  for (const m of moves) {
    if (m.supplier?.trim()) names.add(m.supplier.trim());
    if (m.wholesaler?.trim()) names.add(m.wholesaler.trim());
  }
  res.json([...names].sort((a, b) => a.localeCompare(b)));
}));

router.post('/suppliers', need('suppliers.manage'), wrap(async (req, res) => {
  const name = clean(req.body.name);
  if (!name) throw bad('Supplier name is required.');
  const supplier = await supplierByName(name);
  await hubLog(req, 'Supplier added', 'Inventory', name);
  res.status(201).json({ id: supplier.id, name: supplier.name });
}));

router.get('/product-codes/next', need('products.add', 'imports.new_products', 'imports.mixed'), wrap(async (req, res) => {
  const count = Math.min(Math.max(parseInt(req.query.count, 10) || 1, 1), 2000);
  res.json(await nextProductCodes(count));
}));

// ── create ──────────────────────────────────────────────────────────
/**
 * Build the variant/product records for a set of new SKUs that share a name
 * and category, appending to an existing variant product of the same name and
 * category when there is one (variant indexes only ever grow).
 */
async function createSkuGroup({ base, skus, transaction, importBatchId = null }) {
  const withOptions = skus.some((s) => s.size || s.color);
  const existing = await Product.findOne({
    where: {
      [Op.and]: [
        sequelize.where(sequelize.fn('LOWER', sequelize.col('name')), base.name.toLowerCase()),
        sequelize.where(sequelize.fn('LOWER', sequelize.col('category')), base.category.toLowerCase()),
        { variants: { [Op.ne]: null } },
      ],
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const variantOf = (s) => {
    const options = {};
    if (s.size) options.Size = s.size;
    if (s.color) options.Color = s.color;
    const v = {
      options, sku: s.sku, barcode: s.productCode, price: s.sellingPrice, costPrice: s.costPrice, stock: 0,
      active: s.isActive !== false,
    };
    for (const k of ['rack', 'shelfLocation', 'batchNumber', 'sourceCountry', 'wholesaler']) if (s[k]) v[k] = s[k];
    if (s.reorderLevel !== undefined && s.reorderLevel !== null) v.reorderLevel = s.reorderLevel;
    if (importBatchId) v.importBatchId = importBatchId;
    return v;
  };
  const comboKey = (o) => JSON.stringify([o.Size ?? null, o.Color ?? null]);

  if (existing && hasVariants(existing) && withOptions) {
    const variants = [...existing.variants];
    const seen = new Set(variants.filter((v) => v && !v.archived).map((v) => comboKey(v.options || {})));
    const placed = [];
    for (const s of skus) {
      const v = variantOf(s);
      if (seen.has(comboKey(v.options))) throw bad(`${base.name} already has a ${[s.size, s.color].filter(Boolean).join(' / ')} variant.`);
      seen.add(comboKey(v.options));
      variants.push(v);
      placed.push({ s, productId: existing.id, variantIndex: variants.length - 1 });
    }
    existing.variants = variants;
    existing.variantOptions = variantOptionsFrom(variants);
    existing.changed('variants', true);
    await existing.save({ transaction });
    return { product: existing, placed };
  }

  const supplier = await supplierByName(base.supplier, transaction);
  const common = {
    name: base.name,
    slug: await uniqueSlug(base.name, transaction),
    category: base.category,
    brand: base.brand || 'FEMNIA',
    description: base.description || null,
    designModel: base.designModel || null,
    rack: base.rack || null,
    shelfLocation: base.shelfLocation || null,
    notes: base.notes || null,
    reorderLevel: base.reorderLevel ?? 3,
    active: base.isActive !== false,
    images: base.imageUrl ? [base.imageUrl] : [],
    preferredSupplierId: supplier?.id ?? null,
    batchNumber: base.batchNumber || null,
    sourceCountry: base.sourceCountry || null,
    wholesaler: base.wholesaler || null,
    importBatchId,
  };

  if (skus.length === 1 && !withOptions) {
    const s = skus[0];
    const product = await Product.create({
      ...common,
      code: s.sku,
      barcode: s.productCode,
      price: s.sellingPrice,
      costPrice: s.costPrice,
      rack: s.rack || common.rack,
      shelfLocation: s.shelfLocation || common.shelfLocation,
      reorderLevel: s.reorderLevel ?? common.reorderLevel,
      active: s.isActive !== false && common.active,
      batchNumber: s.batchNumber || common.batchNumber,
      sourceCountry: s.sourceCountry || common.sourceCountry,
      wholesaler: s.wholesaler || common.wholesaler,
    }, { transaction });
    return { product, placed: [{ s, productId: product.id, variantIndex: null }] };
  }

  const seen = new Set();
  const variants = skus.map((s) => {
    const v = variantOf(s);
    if (seen.has(comboKey(v.options))) throw bad(`Two variants have the same size and colour (${[s.size, s.color].filter(Boolean).join(' / ') || 'none'}).`);
    seen.add(comboKey(v.options));
    return v;
  });
  const product = await Product.create({
    ...common,
    price: skus[0].sellingPrice,
    costPrice: skus[0].costPrice,
    variants,
    variantOptions: variantOptionsFrom(variants),
  }, { transaction });
  return { product, placed: skus.map((s, i) => ({ s, productId: product.id, variantIndex: i })) };
}

router.post('/products', need('products.add'), wrap(async (req, res) => {
  const b = req.body || {};
  const name = clean(b.name);
  const category = clean(b.category);
  if (!name) throw bad('Product Name is required.');
  if (!category) throw bad('Category is required.');
  const variants = Array.isArray(b.variants) ? b.variants : [];
  if (!variants.length) throw bad('Add at least one variant.');

  const skus = variants.map((v) => String(v.sku || '').trim().toUpperCase());
  if (skus.some((s) => !s)) throw bad('Every variant needs a SKU Code.');
  const dupSkus = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (dupSkus.length) throw bad(`Duplicate SKU in this form: ${[...new Set(dupSkus)].join(', ')}`);
  const codes = variants.map((v) => normalizeProductCode(v.productCode));
  const dupCodes = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dupCodes.length) throw bad(`Duplicate Product Code in this form: ${[...new Set(dupCodes)].join(', ')}`);

  const used = await usedIdentifiers();
  const takenCodes = codes.filter((c) => used.codes.has(c));
  if (takenCodes.length) throw bad(`These Product Codes already exist: ${takenCodes.map((c) => `${c} (${used.codes.get(c).sku})`).join(', ')}`);
  const takenSkus = skus.filter((s) => used.skus.has(s));
  if (takenSkus.length) throw bad(`These SKU codes already exist: ${takenSkus.join(', ')}`);

  const items = variants.map((v, i) => {
    const costPrice = money(v.costPrice);
    const sellingPrice = money(v.sellingPrice);
    const openingStock = Number(v.openingStock);
    if (costPrice === null || costPrice < 0) throw bad('Cost Price must be 0 or more.');
    if (sellingPrice === null || sellingPrice < 0) throw bad('Selling Price must be 0 or more.');
    if (!Number.isInteger(openingStock) || openingStock < 0) throw bad('Opening Stock must be a whole number of 0 or more.');
    return {
      sku: skus[i], productCode: codes[i], size: clean(v.size), color: clean(v.color), costPrice, sellingPrice,
      openingStock, rack: clean(v.rack), shelfLocation: clean(v.shelfLocation),
      batchNumber: clean(b.batchNumber), sourceCountry: clean(b.sourceCountry), wholesaler: clean(b.wholesaler),
    };
  });
  const imageUrl = clean(b.imageUrl);
  if (imageUrl && !/^(https:\/\/|\/uploads\/)/i.test(imageUrl)) throw bad('Product Image URL must be a secure https:// link.');
  const reorderLevel = Math.max(0, parseInt(b.reorderLevel, 10) || 0);

  const t = await sequelize.transaction();
  let placed;
  try {
    ({ placed } = await createSkuGroup({
      base: {
        name, category, brand: clean(b.brand), description: clean(b.description), designModel: clean(b.designModel),
        rack: clean(b.rack), shelfLocation: clean(b.shelfLocation), supplier: clean(b.supplier), notes: clean(b.notes),
        reorderLevel, isActive: b.isActive !== false, imageUrl, batchNumber: clean(b.batchNumber),
        sourceCountry: clean(b.sourceCountry), wholesaler: clean(b.wholesaler),
      },
      skus: items,
      transaction: t,
    }));
    for (const { s, productId, variantIndex } of placed) {
      if (!s.openingStock) continue;
      await applyStockDelta({
        productId, variantIndex, delta: s.openingStock, transaction: t,
        ctx: {
          kind: 'opening', reference: s.sku, createdBy: req.user.id, unitCost: s.costPrice,
          batchNumber: s.batchNumber, sourceCountry: s.sourceCountry, wholesaler: s.wholesaler,
        },
      });
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
  await recomputeAfter(placed.map((p) => p.productId));
  await hubLog(req, 'Product created', 'Products', skus.join(', '), `${name} — ${skus.length} variant(s).`);
  res.status(201).json({ skus, keys: placed.map((p) => skuKey(p.productId, p.variantIndex)) });
}));

// ── edit ────────────────────────────────────────────────────────────
router.put('/skus/:key', need('products.edit'), wrap(async (req, res) => {
  const b = req.body || {};
  const isAdmin = req.user.role === 'admin';
  const t = await sequelize.transaction();
  let changes = [];
  let sku;
  try {
    const { product, variantIndex } = await loadSku(req.params.key, { transaction: t, lock: t.LOCK.UPDATE });
    const before = skuFields(product, variantIndex);
    sku = before.sku;
    const lock = await skuLock(product, variantIndex);
    const variants = hasVariants(product) ? product.variants.map((v) => ({ ...v })) : null;
    const v = variantIndex == null ? null : variants[variantIndex];
    const setSku = (field, value) => {
      if (v) v[field] = value;
      else product[field] = value;
    };
    const track = (label, oldV, newV) => {
      const o = oldV === undefined || oldV === null || oldV === '' ? null : String(oldV);
      const n = newV === undefined || newV === null || newV === '' ? null : String(newV);
      if (o !== n) changes.push({ field: label, oldValue: o, newValue: n });
      return o !== n;
    };

    // Product Code — admin only, unique across every SKU.
    if (b.productCode !== undefined && isAdmin) {
      const code = clean(b.productCode) ? normalizeProductCode(b.productCode) : null;
      if (code && code !== before.productCode) {
        const used = await usedIdentifiers();
        const owner = used.codes.get(code);
        if (owner && owner.key !== skuKey(product.id, variantIndex)) throw bad(`Product Code ${code} is already used by ${owner.sku}.`);
      }
      if (track('Product Code', before.productCode, code)) {
        if (v) v.barcode = code;
        else product.barcode = code;
      }
    }

    // Size / colour — admin only, and only while the SKU has no history.
    if (v && isAdmin && (b.size !== undefined || b.color !== undefined)) {
      const size = b.size !== undefined ? clean(b.size) : before.size;
      const color = b.color !== undefined ? clean(b.color) : before.color;
      if ((size !== before.size || color !== before.color) && lock.hasHistory) {
        throw bad('This product has transaction history. Create a new SKU for a different size or colour.');
      }
      if (size !== before.size || color !== before.color) {
        const options = { ...(v.options || {}) };
        for (const k of Object.keys(options)) if (SIZE_KEYS.includes(k.toLowerCase()) || COLOR_KEYS.includes(k.toLowerCase())) delete options[k];
        if (size) options.Size = size;
        if (color) options.Color = color;
        const clash = variants.some((o, i) => i !== variantIndex && o && !o.archived
          && JSON.stringify([o.options?.Size ?? null, o.options?.Color ?? null]) === JSON.stringify([options.Size ?? null, options.Color ?? null]));
        if (clash) throw bad(`${product.name} already has a ${[size, color].filter(Boolean).join(' / ')} variant.`);
        track('Size / Age', before.size, size);
        track('Colour / Variant', before.color, color);
        v.options = options;
      }
    }

    if (b.name !== undefined) {
      const name = clean(b.name);
      if (!name) throw bad('Product name is required.');
      if (track('Product name', product.name, name)) product.name = name;
    }
    if (b.category !== undefined) {
      const category = clean(b.category);
      if (!category) throw bad('Category is required.');
      if (track('Category', product.category, category)) product.category = category;
    }
    if (b.rack !== undefined && track('Rack', before.rack, clean(b.rack))) setSku('rack', clean(b.rack));
    if (b.shelfLocation !== undefined && track('Shelf / location', before.shelfLocation, clean(b.shelfLocation))) {
      setSku('shelfLocation', clean(b.shelfLocation));
    }
    if (b.supplier !== undefined) {
      const name = clean(b.supplier);
      if (track('Default supplier', product.preferredSupplier?.name ?? null, name)) {
        const supplier = await supplierByName(name, t);
        product.preferredSupplierId = supplier?.id ?? null;
      }
    }
    if (b.costPrice !== undefined && b.costPrice !== null && can(req, 'products.edit_cost') && can(req, 'products.view_cost')) {
      const cost = money(b.costPrice);
      if (cost === null || cost < 0) throw bad('Cost price must be 0 or more.');
      if (track('Cost price', before.costPrice.toFixed(2), cost.toFixed(2))) setSku('costPrice', cost);
    }
    if (b.sellingPriceQar !== undefined && can(req, 'products.edit_price')) {
      const price = money(b.sellingPriceQar);
      if (price === null || price < 0) throw bad('Selling price must be 0 or more.');
      if (track('Selling price', before.sellingPrice.toFixed(2), price.toFixed(2))) {
        if (v) v.price = price;
        else product.price = price;
      }
    }
    if (b.reorderLevel !== undefined) {
      const level = Math.max(0, parseInt(b.reorderLevel, 10) || 0);
      if (track('Reorder level', before.reorderLevel, level)) setSku('reorderLevel', level);
    }
    if (b.notes !== undefined && track('Notes', before.notes, clean(b.notes))) setSku('notes', clean(b.notes));
    if (b.isActive !== undefined && Boolean(b.isActive) !== before.isActive) {
      if (!can(req, 'products.deactivate')) throw bad('You do not have permission to deactivate products.', 403);
      track('Active status', before.isActive, Boolean(b.isActive));
      if (v) v.active = Boolean(b.isActive);
      else product.active = Boolean(b.isActive);
    }
    if (b.imageUrl !== undefined) {
      const url = clean(b.imageUrl);
      const current = (Array.isArray(product.images) && product.images[0]) || null;
      if (url !== current) {
        if (!can(req, 'products.images')) throw bad('You do not have image permission.', 403);
        if (url && !/^(https:\/\/|\/uploads\/)/i.test(url)) throw bad('Use an uploaded image or a secure https:// link.');
        track('Product image', current, url);
        const rest = Array.isArray(product.images) ? product.images.slice(1) : [];
        product.images = url ? [url, ...rest] : rest;
        product.changed('images', true);
      }
    }

    if (changes.length) {
      if (variants) {
        product.variants = variants;
        product.variantOptions = variantOptionsFrom(variants);
        product.changed('variants', true);
      }
      await product.save({ transaction: t });
      await audit(product, variantIndex, sku, changes, req.user.id, t);
    }
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  if (changes.length) {
    await hubLog(req, 'Product edited', 'Products', sku,
      changes.map((c) => `${c.field}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`).join('; '));
    if (changes.some((c) => c.field === 'Selling price' || c.field === 'Cost price')) {
      await hubLog(req, 'Price changed', 'Products', sku);
    }
  }
  res.json({ key: req.params.key, sku, changes: changes.length });
}));

router.post('/skus/:key/active', need('products.deactivate'), wrap(async (req, res) => {
  const isActive = Boolean(req.body.isActive);
  const { product, variantIndex } = await loadSku(req.params.key);
  const f = skuFields(product, variantIndex);
  if (variantIndex == null) {
    product.active = isActive;
  } else {
    product.variants = product.variants.map((v, i) => (i === variantIndex ? { ...v, active: isActive } : v));
    product.changed('variants', true);
  }
  await product.save();
  await audit(product, variantIndex, f.sku, [{ field: 'Active status', oldValue: String(!isActive), newValue: String(isActive) }], req.user.id);
  await hubLog(req, isActive ? 'Product reactivated' : 'Product deactivated', 'Products', f.sku);
  res.json({ ok: true });
}));

// Permanent delete: admin only, zero stock, no history. A variant is archived
// rather than removed, because later variants' indexes must not shift.
router.delete('/skus/:key', need('products.deactivate'), wrap(async (req, res) => {
  if (req.user.role !== 'admin') throw bad('Only an Admin can delete products permanently.', 403);
  const { product, variantIndex } = await loadSku(req.params.key);
  const f = skuFields(product, variantIndex);
  const [lock, stock] = await Promise.all([skuLock(product, variantIndex), skuStock(product.id, variantIndex)]);
  if (lock.hasHistory || stock !== 0) {
    throw bad('This product cannot be deleted because it has stock or transaction history. Deactivate it instead.');
  }
  const live = skuEntries(product).filter((e) => e.variantIndex !== variantIndex);
  if (variantIndex == null || live.length === 0) {
    await ProductStock.destroy({ where: { productId: product.id } });
    await product.destroy();
  } else {
    product.variants = product.variants.map((v, i) => (i === variantIndex ? { ...v, archived: true, active: false } : v));
    product.variantOptions = variantOptionsFrom(product.variants);
    product.changed('variants', true);
    await product.save();
  }
  await hubLog(req, 'Product deleted', 'Products', f.sku);
  res.json({ ok: true });
}));

// ── stock adjustment ────────────────────────────────────────────────
router.post('/skus/:key/adjust', need('inventory.adjust'), wrap(async (req, res) => {
  const { systemQuantity, countedQuantity, reason, notes, idempotencyKey } = req.body || {};
  const counted = Number(countedQuantity);
  if (!Number.isInteger(counted) || counted < 0) throw bad('Counted quantity cannot be negative.');
  if (!clean(reason)) throw bad('Choose a reason for this adjustment.');
  const key = clean(idempotencyKey);
  if (key && (await StockMovement.findOne({ where: { idempotencyKey: key }, attributes: ['id', 'reference', 'quantity'] }))) {
    return res.json({ duplicate: true, difference: 0, resulting: counted });
  }
  const { product, variantIndex } = await loadSku(req.params.key);
  const f = skuFields(product, variantIndex);
  const reference = `ADJ-${stamp()}-${randomSuffix()}`;
  const t = await sequelize.transaction();
  let systemNow;
  let difference;
  try {
    await applyStockDelta({ productId: product.id, variantIndex, delta: 0, transaction: t, ctx: {} }); // lock the row
    systemNow = await skuStock(product.id, variantIndex, t);
    if (systemNow !== Number(systemQuantity)) {
      throw bad(`Stock changed while this form was open (now ${systemNow}). Reload and enter the counted quantity again.`, 409);
    }
    difference = counted - systemNow;
    if (difference === 0) throw bad('Counted quantity matches the system quantity — nothing to adjust.');
    await applyStockDelta({
      productId: product.id, variantIndex, delta: difference, transaction: t,
      ctx: {
        kind: 'adjustment', reference, reason: clean(reason), notes: clean(notes), idempotencyKey: key,
        createdBy: req.user.id,
      },
    });
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await recomputeAfter([product.id]);
  await hubLog(req, 'Stock adjustment', 'Inventory', f.sku,
    `${reference}: ${systemNow} → ${counted} (${difference > 0 ? '+' : ''}${difference}) · ${clean(reason)}`);
  res.json({ reference, difference, resulting: counted, duplicate: false });
}));

// ── batch corrections (informational fields only) ───────────────────
const BATCH_FIELDS = [['batchNumber', 'Batch number'], ['sourceCountry', 'Source country'], ['wholesaler', 'Wholesaler']];

router.patch('/skus/:key/opening-batch', need('inventory.batch_edit'), wrap(async (req, res) => {
  const { product, variantIndex } = await loadSku(req.params.key);
  const f = skuFields(product, variantIndex);
  const changes = [];
  const variants = hasVariants(product) ? product.variants.map((v) => ({ ...v })) : null;
  for (const [k, label] of BATCH_FIELDS) {
    const next = clean(req.body[k]);
    if ((f[k] ?? null) === next) continue;
    changes.push({ field: `Opening stock batch · ${label}`, oldValue: f[k] ?? null, newValue: next });
    if (variants) variants[variantIndex][k] = next;
    else product[k] = next;
  }
  if (changes.length) {
    const reason = clean(req.body.reason);
    if (reason) changes.push({ field: 'Opening stock batch · Correction reason', oldValue: null, newValue: reason.slice(0, 200) });
    if (variants) {
      product.variants = variants;
      product.changed('variants', true);
    }
    await product.save();
    await audit(product, variantIndex, f.sku, changes, req.user.id);
    await hubLog(req, 'Batch details corrected', 'Inventory', f.sku,
      changes.map((c) => `${c.field}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`).join('; '));
  }
  res.json({ changes: changes.length });
}));

router.patch('/stock-in/:id/batch', need('inventory.batch_edit'), wrap(async (req, res) => {
  const move = await StockMovement.findOne({ where: { id: req.params.id, kind: 'stock_in' } });
  if (!move) throw bad('This Stock In record no longer exists.', 404);
  const product = await Product.findByPk(move.productId);
  const sku = product ? displaySku(product, move.variantIndex) : `P${move.productId}`;
  const changes = [];
  for (const [k, label] of BATCH_FIELDS) {
    const next = clean(req.body[k]);
    if ((move[k] ?? null) === next) continue;
    changes.push({ field: `Stock In batch · ${label}`, oldValue: move[k] ?? null, newValue: next });
    move[k] = next;
  }
  if (changes.length) {
    const reason = clean(req.body.reason);
    if (reason) changes.push({ field: 'Stock In batch · Correction reason', oldValue: null, newValue: reason.slice(0, 200) });
    await move.save();
    if (product) await audit(product, move.variantIndex, sku, changes, req.user.id);
    await hubLog(req, 'Batch details corrected', 'Inventory', sku,
      changes.map((c) => `${c.field}: ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`).join('; '));
  }
  res.json({ changes: changes.length });
}));

// ════════════════════════════════════════════════════════════════════
// Stock In / Stock Out
// ════════════════════════════════════════════════════════════════════
router.get('/stock-in', need('inventory.view', 'inventory.stock_in'), wrap(async (req, res) => {
  const rows = await StockMovement.findAll({
    where: { kind: 'stock_in' }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 500,
  });
  const [detail, names] = await Promise.all([skuDetails(rows), namesById(rows.map((r) => r.createdBy))]);
  res.json(rows.map((r) => {
    const unitCost = r.unitCost === null ? null : parseFloat(r.unitCost);
    return {
      ...detail(r.productId, r.variantIndex),
      id: r.id,
      reference: r.reference || `IN-${r.id}`,
      date: r.txnDate,
      quantity: r.quantity,
      unitCost,
      totalCost: unitCost === null ? null : Math.round(unitCost * r.quantity * 100) / 100,
      supplier: r.supplier,
      invoiceReference: r.invoiceRef,
      receivedBy: r.receivedBy,
      rack: r.rack,
      shelfLocation: r.shelfLocation,
      batchNumber: r.batchNumber,
      sourceCountry: r.sourceCountry,
      wholesaler: r.wholesaler,
      notes: r.notes,
      createdByName: r.createdBy ? names.get(r.createdBy) ?? null : null,
      createdAt: r.createdAt,
    };
  }));
}));

router.get('/stock-out', need('inventory.view', 'inventory.stock_out'), wrap(async (req, res) => {
  const rows = await StockMovement.findAll({
    where: { kind: 'stock_out' }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: 500,
  });
  const [detail, names] = await Promise.all([skuDetails(rows), namesById(rows.map((r) => r.createdBy))]);
  res.json(rows.map((r) => ({
    ...detail(r.productId, r.variantIndex),
    id: r.id,
    reference: r.reference || `OUT-${r.id}`,
    date: r.txnDate,
    quantity: -r.quantity,
    reason: r.reason || 'Other',
    supplier: r.supplier,
    referenceNote: r.referenceNote,
    handledBy: r.handledBy,
    imageUrl: null,
    notes: r.notes,
    createdByName: r.createdBy ? names.get(r.createdBy) ?? null : null,
    createdAt: r.createdAt,
  })));
}));

async function duplicateResult(idempotencyKey, reference, key) {
  if (!idempotencyKey) return null;
  const prior = await StockMovement.findOne({ where: { idempotencyKey } });
  if (!prior) return null;
  const { product, variantIndex } = await loadSku(key);
  const current = await skuStock(product.id, variantIndex);
  return {
    reference: prior.reference || reference, key, sku: displaySku(product, variantIndex), name: product.name,
    previous: current, quantity: Math.abs(prior.quantity), resulting: current, duplicate: true,
  };
}

router.post('/stock-in', need('inventory.stock_in'), wrap(async (req, res) => {
  const b = req.body || {};
  const qty = Number(b.quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw bad('Quantity received must be greater than zero.');
  const idem = clean(b.idempotencyKey);
  const reference = clean(b.reference) || `GRN-${stamp()}-${randomSuffix()}`;
  const dup = await duplicateResult(idem, reference, b.key);
  if (dup) return res.json(dup);

  const { product, variantIndex } = await loadSku(b.key);
  const f = skuFields(product, variantIndex);
  if (!f.isActive) throw bad('This SKU is inactive. Reactivate the product before receiving stock.');
  const unitCost = b.unitCost === null || b.unitCost === '' || b.unitCost === undefined ? null : money(b.unitCost);
  if (unitCost !== null && unitCost < 0) throw bad('Unit Cost cannot be negative.');

  const t = await sequelize.transaction();
  let previous;
  try {
    await applyStockDelta({ productId: product.id, variantIndex, delta: 0, transaction: t, ctx: {} });
    previous = await skuStock(product.id, variantIndex, t);
    await applyStockDelta({
      productId: product.id, variantIndex, delta: qty, transaction: t,
      ctx: {
        kind: 'stock_in', reference, txnDate: dateOnly(b.date), unitCost, supplier: clean(b.supplier),
        invoiceRef: clean(b.invoiceReference), receivedBy: clean(b.receivedBy), rack: clean(b.rack),
        shelfLocation: clean(b.shelfLocation), batchNumber: clean(b.batchNumber), sourceCountry: clean(b.sourceCountry),
        wholesaler: clean(b.wholesaler), notes: clean(b.notes), idempotencyKey: idem, createdBy: req.user.id,
      },
    });
    // Refresh the product's displayed latest supplier / rack / shelf.
    // Historical Stock In rows are never rewritten.
    if (b.updateProductDefaults) {
      let touched = false;
      if (clean(b.supplier)) {
        const supplier = await supplierByName(b.supplier, t);
        if (supplier && supplier.id !== product.preferredSupplierId) {
          product.preferredSupplierId = supplier.id;
          touched = true;
        }
      }
      const variants = hasVariants(product) ? product.variants.map((v) => ({ ...v })) : null;
      for (const k of ['rack', 'shelfLocation']) {
        const val = clean(b[k]);
        if (!val || val === f[k]) continue;
        if (variants) variants[variantIndex][k] = val;
        else product[k] = val;
        touched = true;
      }
      if (variants && touched) {
        product.variants = variants;
        product.changed('variants', true);
      }
      if (touched) await product.save({ transaction: t });
    }
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError' && idem) {
      const again = await duplicateResult(idem, reference, b.key);
      if (again) return res.json(again);
    }
    throw err;
  }
  await recomputeAfter([product.id]);
  await hubLog(req, 'Stock In confirmed', 'Inventory', f.sku,
    `${reference}: +${qty} (${previous} → ${previous + qty})${clean(b.supplier) ? ` · ${clean(b.supplier)}` : ''}`);
  res.json({
    reference, key: b.key, sku: f.sku, name: product.name, previous, quantity: qty, resulting: previous + qty, duplicate: false,
  });
}));

export const STOCK_OUT_REASONS = ['Damaged', 'Lost', 'Expired', 'Internal Use', 'Sample', 'Display Use',
  'Manual Correction', 'Supplier Return', 'Other'];

router.post('/stock-out', need('inventory.stock_out'), wrap(async (req, res) => {
  const b = req.body || {};
  const qty = Number(b.quantity);
  if (!Number.isInteger(qty) || qty <= 0) throw bad('Quantity must be greater than zero.');
  const reason = STOCK_OUT_REASONS.includes(b.reason) ? b.reason : null;
  if (!reason) throw bad('Choose a reason for this Stock Out.');
  const idem = clean(b.idempotencyKey);
  const reference = clean(b.reference) || `SO-${stamp()}-${randomSuffix()}`;
  const dup = await duplicateResult(idem, reference, b.key);
  if (dup) return res.json(dup);

  const { product, variantIndex } = await loadSku(b.key);
  const f = skuFields(product, variantIndex);
  const t = await sequelize.transaction();
  let previous;
  try {
    const row = await applyStockDelta({ productId: product.id, variantIndex, delta: 0, transaction: t, ctx: {} });
    previous = await skuStock(product.id, variantIndex, t);
    if (qty > previous || qty > row.quantity) {
      throw bad(`Only ${Math.min(previous, row.quantity)} unit(s) are in stock for ${f.sku}. Stock cannot go negative.`);
    }
    await applyStockDelta({
      productId: product.id, variantIndex, delta: -qty, transaction: t,
      ctx: {
        kind: 'stock_out', reference, txnDate: dateOnly(b.date), reason,
        supplier: reason === 'Supplier Return' ? clean(b.supplier) : null, referenceNote: clean(b.referenceNote),
        handledBy: clean(b.handledBy), notes: clean(b.notes), idempotencyKey: idem, createdBy: req.user.id,
      },
    });
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError' && idem) {
      const again = await duplicateResult(idem, reference, b.key);
      if (again) return res.json(again);
    }
    throw err;
  }
  await recomputeAfter([product.id]);
  await hubLog(req, 'Stock Out confirmed', 'Inventory', f.sku,
    `${reference}: -${qty} (${previous} → ${previous - qty}) · ${reason}`);
  res.json({
    reference, key: b.key, sku: f.sku, name: product.name, previous, quantity: qty, resulting: previous - qty, duplicate: false,
  });
}));

// ════════════════════════════════════════════════════════════════════
// Spreadsheet imports (the hub's own; routes/bulkProducts.js is separate)
// ════════════════════════════════════════════════════════════════════
const IMPORT_KINDS = { new_products: 'New Products', stock_in: 'Stock In', mixed: 'Mixed Product File' };
const IMPORT_PERMS = { new_products: 'imports.new_products', stock_in: 'imports.stock_in', mixed: 'imports.mixed' };

async function mapBatch(batch, names) {
  return {
    id: String(batch.id),
    batchType: batch.batchType,
    filename: batch.filename,
    fileHash: batch.fileHash,
    status: batch.status,
    totalRows: batch.totalRows,
    successRows: batch.successRows,
    failedRows: batch.failedRows,
    unitsAdded: batch.unitsAdded,
    totalCost: parseFloat(batch.totalCost) || 0,
    skus: batch.skus || [],
    createdByName: batch.createdBy ? names.get(batch.createdBy) ?? null : null,
    createdAt: batch.createdAt,
    reversedAt: batch.reversedAt,
    reverseReason: batch.reverseReason,
    report: batch.report,
  };
}

router.get('/imports', need('imports.history'), wrap(async (req, res) => {
  const rows = await ImportBatch.findAll({ order: [['createdAt', 'DESC']], limit: 200 });
  const names = await namesById(rows.map((r) => r.createdBy));
  res.json(await Promise.all(rows.map((r) => mapBatch(r, names))));
}));

router.get('/imports/by-hash/:hash', need('imports.new_products', 'imports.stock_in', 'imports.mixed'), wrap(async (req, res) => {
  const row = await ImportBatch.findOne({ where: { fileHash: req.params.hash }, order: [['createdAt', 'DESC']] });
  if (!row) return res.json(null);
  res.json(await mapBatch(row, await namesById([row.createdBy])));
}));

router.post('/imports/:kind', wrap(async (req, res, next) => {
  const kind = req.params.kind;
  if (!IMPORT_KINDS[kind]) throw bad('Unknown import type.', 404);
  if (!HUB_ROLES.includes(req.user.role) || !can(req, IMPORT_PERMS[kind])) throw bad('You do not have permission to run this import.', 403);
  if (kind === 'mixed' && req.user.role !== 'admin') throw bad('Mixed imports are Admin only.', 403);
  const b = req.body || {};
  const input = (Array.isArray(b.rows) ? b.rows : []).filter((r) => r && (r.status === 'Ready' || r.status === 'Warning'));
  if (!input.length) throw bad('There are no valid rows to import.');
  if (input.length > 2000) throw bad('The limit is 2000 rows per import.');

  const batch = await ImportBatch.create({
    batchType: kind,
    filename: String(b.filename || 'import').slice(0, 250),
    fileHash: /^[a-f0-9]{64}$/.test(b.fileHash || '') ? b.fileHash : null,
    status: 'Processing',
    totalRows: Array.isArray(b.rows) ? b.rows.length : input.length,
    createdBy: req.user.id,
  });

  // Revalidate against live data — the preview may be stale.
  const skus = await listSkus({ showCost: true });
  const known = new Map(skus.map((s) => [String(s.sku).toUpperCase(), s]));
  const used = await usedIdentifiers();
  const failures = [];
  const seen = new Set();
  const seenCodes = new Set();
  const newRows = [];
  const stockRows = [];
  for (const raw of input) {
    const row = {
      rowNumber: parseInt(raw.rowNumber, 10) || 0,
      sku: String(raw.sku || '').trim().toUpperCase(),
      productCode: raw.productCode ? String(raw.productCode) : null,
      name: clean(raw.name) || '',
      category: clean(raw.category),
      designModel: clean(raw.designModel),
      size: clean(raw.size),
      color: clean(raw.color),
      costPrice: money(raw.costPrice) ?? 0,
      sellingPrice: money(raw.sellingPrice) ?? 0,
      quantity: Number(raw.quantity),
      reorderLevel: Number.isInteger(Number(raw.reorderLevel)) ? Number(raw.reorderLevel) : 3,
      supplier: clean(raw.supplier),
      rack: clean(raw.rack),
      shelfLocation: clean(raw.shelfLocation),
      description: clean(raw.description),
      notes: clean(raw.notes),
      imageUrl: /^https:\/\/[\w.-]+\//i.test(raw.imageUrl || '') ? raw.imageUrl : null,
      active: raw.active !== false,
      date: dateOnly(raw.date),
      purchaseReference: clean(raw.purchaseReference),
      receivedBy: clean(raw.receivedBy),
      batchNumber: clean(raw.batchNumber),
      sourceCountry: clean(raw.sourceCountry),
      wholesaler: clean(raw.wholesaler),
      unitCostDefaulted: Boolean(raw.unitCostDefaulted),
    };
    const existing = known.get(row.sku);
    const target = kind === 'stock_in' ? 'STOCK IN' : kind === 'new_products' ? 'NEW PRODUCT' : existing ? 'STOCK IN' : 'NEW PRODUCT';
    let message = null;
    if (!row.sku) message = 'SKU Code is missing.';
    else if (seen.has(row.sku)) message = 'Duplicate SKU inside this file.';
    else if (!Number.isInteger(row.quantity) || row.quantity < 0) message = 'Quantity must be a whole number.';
    else if (target === 'NEW PRODUCT' && (existing || used.skus.has(row.sku))) message = 'This SKU already exists.';
    else if (target === 'NEW PRODUCT' && (!row.name || !row.category)) message = 'Product Name and Category are required.';
    else if (target === 'STOCK IN' && !existing) message = 'Unknown SKU.';
    else if (target === 'STOCK IN' && !existing.isActive) message = 'SKU is inactive.';
    else if (target === 'STOCK IN' && row.quantity <= 0) message = 'Quantity must be greater than zero.';
    if (!message && target === 'NEW PRODUCT') {
      try {
        row.productCode = normalizeProductCode(row.productCode);
      } catch {
        message = 'Product Code must contain digits only.';
      }
      if (!message && (used.codes.has(row.productCode) || seenCodes.has(row.productCode))) {
        message = `Product Code ${row.productCode} is already used.`;
      }
    }
    seen.add(row.sku);
    if (message) {
      failures.push({ rowNumber: row.rowNumber, sku: row.sku, message });
      continue;
    }
    if (target === 'NEW PRODUCT') {
      seenCodes.add(row.productCode);
      newRows.push(row);
    } else {
      if (row.unitCostDefaulted) row.costPrice = existing.costPrice;
      row.key = existing.key;
      stockRows.push(row);
    }
  }

  let doNew = kind !== 'stock_in';
  let doStock = kind !== 'new_products';
  if (kind === 'mixed') {
    doNew = Boolean(b.approveNewProducts);
    doStock = Boolean(b.approveStockIn);
  }
  const applyNew = doNew ? newRows : [];
  const applyStock = doStock ? stockRows : [];

  const t = await sequelize.transaction();
  const touched = [];
  try {
    // New products: rows sharing a name and category become one product with variants.
    const groups = new Map();
    for (const row of applyNew) {
      const gk = `${row.name.toLowerCase()}|${(row.category || '').toLowerCase()}`;
      if (!groups.has(gk)) groups.set(gk, []);
      groups.get(gk).push(row);
    }
    for (const rows of groups.values()) {
      const first = rows[0];
      const { placed } = await createSkuGroup({
        base: {
          name: first.name, category: first.category, designModel: first.designModel, description: first.description,
          supplier: first.supplier, notes: first.notes, reorderLevel: first.reorderLevel, isActive: rows.some((r) => r.active),
          imageUrl: first.imageUrl, rack: first.rack, shelfLocation: first.shelfLocation,
          batchNumber: first.batchNumber, sourceCountry: first.sourceCountry, wholesaler: first.wholesaler,
        },
        skus: rows.map((r) => ({
          sku: r.sku, productCode: r.productCode, size: r.size, color: r.color, costPrice: r.costPrice,
          sellingPrice: r.sellingPrice, rack: r.rack, shelfLocation: r.shelfLocation, reorderLevel: r.reorderLevel,
          isActive: r.active, batchNumber: r.batchNumber, sourceCountry: r.sourceCountry, wholesaler: r.wholesaler,
        })),
        transaction: t,
        importBatchId: batch.id,
      });
      for (const { s, productId, variantIndex } of placed) {
        const row = rows.find((r) => r.sku === s.sku);
        touched.push(productId);
        if (!row.quantity) continue;
        await applyStockDelta({
          productId, variantIndex, delta: row.quantity, transaction: t,
          ctx: {
            kind: 'opening', reference: row.sku, unitCost: row.costPrice, batchNumber: row.batchNumber,
            sourceCountry: row.sourceCountry, wholesaler: row.wholesaler, importBatchId: batch.id,
            idempotencyKey: `${batch.id}-${row.rowNumber}`, createdBy: req.user.id,
          },
        });
      }
    }
    for (const row of applyStock) {
      const { productId, variantIndex } = { productId: Number(row.key.split(':')[0]), variantIndex: row.key.endsWith(':base') ? null : Number(row.key.split(':')[1]) };
      touched.push(productId);
      await applyStockDelta({
        productId, variantIndex, delta: row.quantity, transaction: t,
        ctx: {
          kind: 'stock_in', reference: `GRN-${stamp()}-${randomSuffix()}`, txnDate: row.date, unitCost: row.costPrice,
          supplier: row.supplier, invoiceRef: row.purchaseReference, receivedBy: row.receivedBy, rack: row.rack,
          shelfLocation: row.shelfLocation, notes: row.notes, batchNumber: row.batchNumber,
          sourceCountry: row.sourceCountry, wholesaler: row.wholesaler, importBatchId: batch.id,
          idempotencyKey: `${batch.id}-${row.rowNumber}`, createdBy: req.user.id,
        },
      });
    }
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    await batch.update({
      status: 'Failed', successRows: 0, failedRows: batch.totalRows, unitsAdded: 0, totalCost: 0, skus: [],
      report: { error: err.message },
    });
    throw err.status ? err : bad(`Import failed: ${err.message}`);
  }
  await recomputeAfter(touched);

  const processed = [...applyNew, ...applyStock];
  const unitsAdded = processed.reduce((s, r) => s + r.quantity, 0);
  const totalCost = Math.round(processed.reduce((s, r) => s + r.quantity * r.costPrice, 0) * 100) / 100;
  const skuList = processed.map((r) => r.sku);
  await batch.update({
    status: failures.length ? 'Completed with Errors' : 'Completed',
    successRows: processed.length,
    failedRows: failures.length,
    unitsAdded,
    totalCost,
    skus: skuList,
    report: { failures },
  });
  await hubLog(req, `${IMPORT_KINDS[kind]} import completed`, 'Imports', String(batch.id),
    `${batch.filename}: ${applyNew.length} new products, ${applyStock.length} Stock In rows, ${unitsAdded} units.`);
  res.json({
    batchId: String(batch.id),
    rowsProcessed: processed.length,
    productsCreated: applyNew.length,
    stockInRows: applyStock.length,
    unitsAdded,
    totalCost,
    failedRows: failures.length,
    skus: skuList,
    failures,
  });
}));

router.post('/imports/:id/reverse', need('imports.reverse'), wrap(async (req, res) => {
  const reason = clean(req.body.reason);
  if (!reason) throw bad('A reversal reason is required.');
  const batch = await ImportBatch.findByPk(req.params.id);
  if (!batch) throw bad('This import batch no longer exists.', 404);
  if (batch.reversedAt) throw bad('This import has already been reversed.');
  const notes = [];
  const touched = [];
  const t = await sequelize.transaction();
  try {
    if (batch.batchType === 'stock_in' || batch.batchType === 'mixed') {
      const rows = await StockMovement.findAll({ where: { importBatchId: batch.id, kind: 'stock_in' }, transaction: t });
      for (const row of rows) {
        const current = await skuStock(row.productId, row.variantIndex, t);
        if (current < row.quantity) {
          const p = await Product.findByPk(row.productId, { transaction: t });
          throw bad(`Cannot reverse: ${p ? displaySku(p, row.variantIndex) : row.productId} only has ${current} units in stock and the import added ${row.quantity}.`);
        }
      }
      for (const row of rows) {
        touched.push(row.productId);
        await applyStockDelta({
          productId: row.productId, variantIndex: row.variantIndex, delta: -row.quantity, transaction: t,
          ctx: {
            kind: 'stock_out', reference: `SO-${stamp()}-${randomSuffix()}`, reason: 'Manual Correction',
            referenceNote: `Reversal of import ${batch.id}`, notes: reason, importBatchId: batch.id, createdBy: req.user.id,
          },
        });
      }
      notes.push(`${rows.length} Stock In rows reversed with ledger corrections.`);
    }
    if (batch.batchType === 'new_products' || batch.batchType === 'mixed') {
      const candidates = await Product.findAll({
        where: {
          [Op.or]: [
            { importBatchId: batch.id },
            sequelize.where(sequelize.cast(sequelize.col('variants'), 'CHAR'), { [Op.like]: `%"importBatchId":${batch.id}%` }),
          ],
        },
        transaction: t,
      });
      let deactivated = 0;
      let cleared = 0;
      for (const product of candidates) {
        const whole = product.importBatchId === batch.id;
        const indexes = hasVariants(product)
          ? product.variants.map((v, i) => (v && (whole || v.importBatchId === batch.id) ? i : -1)).filter((i) => i >= 0)
          : (whole ? [null] : []);
        for (const variantIndex of indexes) {
          const lock = await skuLock(product, variantIndex);
          if (!lock.hasHistory) {
            const opening = await StockMovement.sum('quantity', {
              where: { productId: product.id, variantIndex: variantIndex ?? { [Op.is]: null }, kind: 'opening' }, transaction: t,
            });
            if (opening) {
              await applyStockDelta({
                productId: product.id, variantIndex, delta: -opening, transaction: t,
                ctx: { kind: 'opening', reference: `REV-IMPORT-${batch.id}`, reason: 'Import reversed', notes: reason, importBatchId: batch.id, createdBy: req.user.id },
              });
              cleared += 1;
            }
          }
          deactivated += 1;
        }
        if (whole) product.active = false;
        if (hasVariants(product)) {
          product.variants = product.variants.map((v, i) => (indexes.includes(i) ? { ...v, active: false } : v));
          product.changed('variants', true);
        }
        await product.save({ transaction: t });
        touched.push(product.id);
      }
      notes.push(`${deactivated} products deactivated, opening stock cleared on ${cleared} with no later transactions.`);
    }
    await batch.update({ status: 'Reversed', reversedAt: new Date(), reversedBy: req.user.id, reverseReason: reason.slice(0, 500) }, { transaction: t });
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
  await recomputeAfter(touched);
  await hubLog(req, 'Import reversed', 'Imports', String(batch.id), `${reason} — ${notes.join(' ')}`);
  res.json({ note: notes.join(' ') });
}));

export default router;
