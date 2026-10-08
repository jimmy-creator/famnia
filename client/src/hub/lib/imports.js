/**
 * Excel / CSV import engine for the hub.
 *
 * Two strictly separated workflows:
 *   • New Products import → creates products / SKU variants, quantity becomes Opening Stock.
 *   • Stock In import     → adds received units to SKUs that already exist.
 * The Admin-only Mixed import classifies each row into one of the two above.
 *
 * Validation here is a read-only preview against the live SKU list; the
 * server revalidates every row before anything is written.
 */
import { nextProductCodes } from '@/hub/lib/api';
import { today, tryNormalizeProductCode } from '@/hub/lib/format';

export const IMPORT_KIND_LABELS = {
  new_products: 'New Products',
  stock_in: 'Stock In',
  mixed: 'Mixed Product File',
};

export const NEW_PRODUCT_FIELDS = [
  { key: 'productCode', label: 'Product Code', aliases: ['product code', 'code no', 'product no', 'item number', 'product number'] },
  { key: 'sku', label: 'SKU Code', required: true, aliases: ['sku', 'sku code', 'item code', 'code', 'barcode'] },
  { key: 'name', label: 'Product Name', required: true, aliases: ['product', 'product name', 'item name', 'name', 'description name'] },
  { key: 'category', label: 'Category', required: true, aliases: ['category', 'type', 'group'] },
  { key: 'designModel', label: 'Design/Model', aliases: ['design', 'model', 'design/model', 'design model'] },
  { key: 'size', label: 'Size/Age', aliases: ['size', 'age', 'size/age', 'size age'] },
  { key: 'color', label: 'Colour/Variant', aliases: ['colour', 'color', 'variant', 'colour/variant', 'colour variant'] },
  { key: 'costPrice', label: 'Cost Price', required: true, aliases: ['cost', 'cost price', 'unit cost', 'purchase price', 'buying price'] },
  { key: 'sellingPrice', label: 'Selling Price', required: true, aliases: ['price', 'selling price', 'retail price', 'sale price', 'mrp'] },
  { key: 'quantity', label: 'Opening Stock', required: true, aliases: ['opening stock', 'qty', 'quantity', 'stock', 'opening qty', 'quantity received'] },
  { key: 'reorderLevel', label: 'Reorder Level', aliases: ['reorder level', 'reorder', 'min stock', 'minimum stock'] },
  { key: 'supplier', label: 'Supplier', aliases: ['supplier', 'supplier name', 'vendor', 'vendor name'] },
  { key: 'rack', label: 'Rack', aliases: ['rack'] },
  { key: 'shelfLocation', label: 'Shelf Location', aliases: ['shelf', 'shelf location', 'bin', 'location'] },
  { key: 'description', label: 'Product Description', aliases: ['product description', 'description', 'details'] },
  { key: 'batchNumber', label: 'Batch Number', aliases: ['batch', 'batch number', 'batch details', 'batch detail', 'batch info', 'batch name', 'batch code', 'batch no', 'lot', 'lot number'] },
  { key: 'sourceCountry', label: 'Source Country', aliases: ['source country', 'country', 'origin', 'country of origin', 'made in'] },
  { key: 'wholesaler', label: 'Wholesaler', aliases: ['wholesaler', 'wholesale supplier', 'wholeseller', 'wholesaler name'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'remarks', 'comment'] },
  { key: 'active', label: 'Active', aliases: ['active', 'status', 'is active'] },
  { key: 'imageUrl', label: 'Product Image URL', aliases: ['image', 'image url', 'photo', 'photo url'] },
];

export const STOCK_IN_FIELDS = [
  { key: 'date', label: 'Stock In Date', aliases: ['date', 'stock in date', 'grn date', 'received date'] },
  { key: 'sku', label: 'SKU Code', required: true, aliases: ['sku', 'sku code', 'item code', 'code', 'barcode'] },
  { key: 'quantity', label: 'Quantity Received', required: true, aliases: ['quantity received', 'qty', 'quantity', 'received', 'stock'] },
  { key: 'costPrice', label: 'Unit Cost', aliases: ['unit cost', 'cost', 'cost price', 'purchase price'] },
  { key: 'supplier', label: 'Supplier', aliases: ['supplier', 'supplier name', 'vendor', 'vendor name'] },
  { key: 'purchaseReference', label: 'Purchase Reference', aliases: ['purchase reference', 'invoice', 'invoice reference', 'po', 'reference'] },
  { key: 'rack', label: 'Rack', aliases: ['rack'] },
  { key: 'shelfLocation', label: 'Shelf Location', aliases: ['shelf', 'shelf location', 'bin', 'location'] },
  { key: 'receivedBy', label: 'Received By', aliases: ['received by', 'receiver', 'handled by'] },
  { key: 'batchNumber', label: 'Batch Number', aliases: ['batch', 'batch number', 'batch details', 'batch detail', 'batch info', 'batch name', 'batch code', 'batch no', 'lot', 'lot number'] },
  { key: 'sourceCountry', label: 'Source Country', aliases: ['source country', 'country', 'origin', 'country of origin', 'made in'] },
  { key: 'wholesaler', label: 'Wholesaler', aliases: ['wholesaler', 'wholesale supplier', 'wholeseller', 'wholesaler name'] },
  { key: 'notes', label: 'Notes', aliases: ['notes', 'remarks', 'comment'] },
  { key: 'name', label: 'Product Name (check only)', aliases: ['product', 'product name', 'item name', 'name'] },
  { key: 'size', label: 'Size (check only)', aliases: ['size', 'age'] },
  { key: 'color', label: 'Colour (check only)', aliases: ['colour', 'color', 'variant'] },
];

export const fieldsFor = (kind) => (kind === 'stock_in' ? STOCK_IN_FIELDS : NEW_PRODUCT_FIELDS);

/** Ambiguous quantity headings are never auto-mapped — the user must confirm them. */
const AMBIGUOUS_QUANTITY = ['qty', 'quantity', 'stock'];

export function suggestMapping(headers, fields) {
  const norm = headers.map((h) => h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim());
  const mapping = {};
  const used = new Set();
  for (const field of fields) {
    let index = null;
    for (const alias of field.aliases) {
      const found = norm.findIndex((h, i) => h === alias && !used.has(i));
      if (found >= 0) {
        if (field.key === 'quantity' && AMBIGUOUS_QUANTITY.includes(alias)) break;
        index = found;
        break;
      }
    }
    if (index !== null) used.add(index);
    mapping[field.key] = index;
  }
  // Relaxed second pass: headings such as "Batch Details (UAE)" or "Product Selling Price".
  for (const field of fields) {
    if (mapping[field.key] !== null) continue;
    for (const alias of field.aliases) {
      if (alias.length < 5 || (field.key === 'quantity' && AMBIGUOUS_QUANTITY.includes(alias))) continue;
      const found = norm.findIndex((h, i) => !used.has(i) && h.includes(alias));
      if (found >= 0) {
        used.add(found);
        mapping[field.key] = found;
        break;
      }
    }
  }
  return mapping;
}

/* ------------------------------ normalisation ----------------------------- */
const text = (value) => (value ?? '').replace(/\s+/g, ' ').trim();
const optional = (value) => text(value) || null;

function num(value) {
  const raw = text(value).replace(/[,\s]/g, '').replace(/^(qar|qr|aed|inr|rs\.?|\$)/i, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const [, a, b, c] = dmy;
    const day = Number(a);
    const month = Number(b);
    const year = Number(c.length === 2 ? `20${c}` : c);
    if (day > 12 && month <= 12) return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (month > 12 && day <= 12) return `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizeActive(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return true;
  if (['yes', 'y', 'true', '1', 'active'].includes(raw)) return true;
  if (['no', 'n', 'false', '0', 'inactive'].includes(raw)) return false;
  return null;
}

const normalizeSku = (value) => text(value).toUpperCase();

const isInstructionRow = (cells) =>
  cells.some((c) => /^example row|delete before importing|do not delete/i.test(c)) ||
  cells.every((c) => !c) ||
  cells.some((c) => /^EXAMPLE-/i.test(c));

/**
 * Validates a mapped grid against the live SKU list. Read-only: nothing is
 * written and no inventory changes, however many times it is called.
 */
export async function validateImport(kind, grid, mapping, products) {
  const existing = new Map(products.map((p) => [String(p.sku).toUpperCase(), p]));
  const usedCodes = new Map();
  for (const p of products) if (p.productCode) usedCodes.set(p.productCode, p.sku);
  const body = grid.slice(1);
  const todayIso = today();
  const seen = new Map();
  const seenCodes = new Map();
  const autoCodes = kind !== 'stock_in' && body.length ? await nextProductCodes(body.length) : [];
  let autoCodeAt = 0;
  const rows = [];

  body.forEach((cells, index) => {
    if (isInstructionRow(cells)) return;
    const at = (key) => {
      const col = mapping[key];
      return col === null || col === undefined ? undefined : cells[col];
    };

    const messages = [];
    const sku = normalizeSku(at('sku'));
    const known = existing.get(sku);
    const quantity = num(at('quantity'));
    const costPrice = num(at('costPrice'));
    const sellingPrice = num(at('sellingPrice'));
    const reorderLevel = num(at('reorderLevel'));
    const active = normalizeActive(at('active'));
    const date = normalizeDate(at('date')) ?? todayIso;
    const rawCode = text(at('productCode'));
    let productCode = rawCode ? tryNormalizeProductCode(rawCode) : null;

    let classification =
      kind === 'stock_in' ? 'STOCK IN' : kind === 'new_products' ? 'NEW PRODUCT' : known ? 'STOCK IN' : 'NEW PRODUCT';

    if (!sku) messages.push('SKU Code is missing.');
    if (sku && seen.has(sku)) {
      messages.push(`Duplicate SKU inside this file (also row ${seen.get(sku)}).`);
      classification = 'DUPLICATE';
    }
    if (sku) seen.set(sku, index + 2);

    if (quantity === null || !Number.isInteger(quantity) || quantity < 0) {
      messages.push(
        classification === 'STOCK IN'
          ? 'Quantity Received must be a whole number greater than zero.'
          : 'Opening Stock must be a whole number of 0 or more.',
      );
    } else if (classification === 'STOCK IN' && quantity <= 0) {
      messages.push('Quantity Received must be greater than zero.');
    }

    let unitCostDefaulted = false;

    if (classification === 'NEW PRODUCT') {
      if (kind !== 'mixed' && known) {
        messages.push('This SKU already exists — use the Stock In import to add received units.');
        classification = 'DUPLICATE';
      }
      if (!text(at('name'))) messages.push('Product Name is missing.');
      if (!text(at('category'))) messages.push('Category is missing.');
      if (costPrice === null || costPrice < 0) messages.push('Cost Price must be a number of 0 or more.');
      if (sellingPrice === null || sellingPrice < 0) messages.push('Selling Price must be a number of 0 or more.');
      if (reorderLevel !== null && (!Number.isInteger(reorderLevel) || reorderLevel < 0)) {
        messages.push('Reorder Level must be a whole number of 0 or more.');
      }
      if (rawCode && !productCode) {
        messages.push('Product Code must contain digits only.');
      } else if (productCode && usedCodes.has(productCode)) {
        messages.push(`Product Code ${productCode} is already used by ${usedCodes.get(productCode)}.`);
        productCode = null;
      } else if (productCode && seenCodes.has(productCode)) {
        messages.push(`Duplicate Product Code inside this file (also row ${seenCodes.get(productCode)}).`);
        productCode = null;
      }
      if (productCode) {
        seenCodes.set(productCode, index + 2);
      } else if (!rawCode) {
        while (autoCodeAt < autoCodes.length) {
          const candidate = autoCodes[autoCodeAt++];
          if (!usedCodes.has(candidate) && !seenCodes.has(candidate)) {
            productCode = candidate;
            seenCodes.set(candidate, index + 2);
            break;
          }
        }
      }
      if (active === null) messages.push('Active must be Yes or No.');
      const url = optional(at('imageUrl'));
      if (url && !/^https:\/\/[\w.-]+\//i.test(url)) {
        messages.push('Product Image URL must be a secure https link — it was ignored.');
      }
    } else {
      if (!known && sku) {
        messages.push('Unknown SKU — create this product first using Import New Products or Add New Product.');
        classification = 'INVALID';
      }
      if (known && !known.isActive) messages.push('This SKU is inactive. Reactivate the product before receiving stock.');
      if (costPrice === null) unitCostDefaulted = true;
      else if (costPrice < 0) messages.push('Unit Cost cannot be negative.');
      const suppliedName = text(at('name'));
      if (known && suppliedName && suppliedName.toLowerCase() !== known.name.toLowerCase()) {
        messages.push(`Product Name does not match this SKU (${known.name}).`);
      }
      const suppliedSize = optional(at('size'));
      if (known && suppliedSize && (known.size ?? '').toLowerCase() !== suppliedSize.toLowerCase()) {
        messages.push(`Size does not match this SKU (${known.size ?? '—'}).`);
      }
      const suppliedColor = optional(at('color'));
      if (known && suppliedColor && (known.color ?? '').toLowerCase() !== suppliedColor.toLowerCase()) {
        messages.push(`Colour does not match this SKU (${known.color ?? '—'}).`);
      }
    }

    const blocking = messages.filter((m) => !/was ignored|does not match/i.test(m));
    const status =
      classification === 'DUPLICATE'
        ? 'Duplicate'
        : blocking.length
          ? 'Invalid'
          : messages.length || unitCostDefaulted
            ? 'Warning'
            : 'Ready';
    if (status === 'Invalid') classification = classification === 'DUPLICATE' ? 'DUPLICATE' : 'INVALID';

    const finalCost = classification === 'STOCK IN' ? (costPrice ?? known?.costPrice ?? 0) : (costPrice ?? 0);
    const qty = quantity ?? 0;
    const previousStock = known ? known.currentStock : classification === 'NEW PRODUCT' ? 0 : null;

    rows.push({
      rowNumber: index + 2,
      status,
      classification,
      messages,
      sku,
      productCode,
      name: text(at('name')) || known?.name || '',
      category: optional(at('category')),
      designModel: optional(at('designModel')),
      size: optional(at('size')) ?? known?.size ?? null,
      color: optional(at('color')) ?? known?.color ?? null,
      costPrice: finalCost,
      sellingPrice: sellingPrice ?? 0,
      quantity: qty,
      reorderLevel: reorderLevel ?? 3,
      supplier: optional(at('supplier')),
      rack: optional(at('rack')),
      shelfLocation: optional(at('shelfLocation')),
      description: optional(at('description')),
      notes: optional(at('notes')),
      imageUrl: (() => {
        const url = optional(at('imageUrl'));
        return url && /^https:\/\/[\w.-]+\//i.test(url) ? url : null;
      })(),
      active: active ?? true,
      date,
      purchaseReference: optional(at('purchaseReference')),
      receivedBy: optional(at('receivedBy')),
      batchNumber: optional(at('batchNumber')),
      sourceCountry: optional(at('sourceCountry')),
      wholesaler: optional(at('wholesaler')),
      previousStock,
      resultingStock: previousStock === null ? null : previousStock + qty,
      unitCostDefaulted,
    });
  });

  return { rows, totals: totalsOf(rows) };
}

export function totalsOf(rows) {
  const usable = rows.filter((r) => r.status === 'Ready' || r.status === 'Warning');
  return {
    total: rows.length,
    valid: rows.filter((r) => r.status === 'Ready').length,
    warning: rows.filter((r) => r.status === 'Warning').length,
    invalid: rows.filter((r) => r.status === 'Invalid').length,
    duplicate: rows.filter((r) => r.status === 'Duplicate').length,
    newProducts: usable.filter((r) => r.classification === 'NEW PRODUCT').length,
    stockInRows: usable.filter((r) => r.classification === 'STOCK IN').length,
    units: usable.reduce((sum, r) => sum + r.quantity, 0),
    costValue: Math.round(usable.reduce((sum, r) => sum + r.quantity * r.costPrice, 0) * 100) / 100,
    retailValue: Math.round(usable.reduce((sum, r) => sum + r.quantity * r.sellingPrice, 0) * 100) / 100,
  };
}

export const isImportable = (row) => row.status === 'Ready' || row.status === 'Warning';
