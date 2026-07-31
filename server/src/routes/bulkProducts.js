import { Router } from 'express';
import { Product, Category, Location, ProductStock, Setting, Supplier, recomputeProductStock } from '../models/index.js';
import { protect, admin } from '../middleware/auth.js';
import multer from 'multer';
import csvParser from 'csv-parser';
import { createObjectCsvStringifier } from 'csv-writer';
import { Readable } from 'stream';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ────────────────────────────────────────────────────────────────────
// CSV format (Shopify-style)
//
// One product can span multiple rows. All rows for one product share
// the same `Handle`. The FIRST row of a handle group carries parent
// fields (Name, Description, Category, Brand, etc.) and the first
// variant. Subsequent rows for the same handle carry only variant
// option values + per-variant SKU/price/stock columns.
//
// Per-location stock columns are dynamic: any header named
// `Stock - <Location Name>` (case-insensitive) maps to a Location row
// by name (or `code`). A plain `Stock` column is used as a fallback
// and lands on the online-default location.
//
// Backwards compatibility: if the CSV has NO `Handle` column at all,
// the importer falls back to the legacy single-row mode (no variants,
// no multi-loc) so old templates still work.
// ────────────────────────────────────────────────────────────────────

const TRUE_VALS = new Set(['yes', 'true', '1', 'y', 't']);
const truthy = (v) => TRUE_VALS.has(String(v ?? '').trim().toLowerCase());

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Case-insensitive row reader: row.get('Name') returns row.Name || row.name || ''
function rowGet(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
    const lower = k.toLowerCase();
    for (const actual of Object.keys(row)) {
      if (actual.toLowerCase() === lower && row[actual] !== undefined && row[actual] !== '') {
        return row[actual];
      }
    }
  }
  return '';
}

function parseFloatOrNull(v) {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// ────────────────────────────────────────────────────────────────────
// Inventory stock-sheet format (primary)
//
// One row per product, matching the Excel stock sheet. Excel wraps long
// headers, so a header cell arrives as "SKU\nCode" rather than
// "SKU Code" — every lookup here normalises whitespace and case.
//
// Columns that are spreadsheet formulas — Markup %, Selling Price (INR),
// Profit %, Total Retail Value (INR), Stock Status — are ignored on
// import and recomputed on export. Shelf / Location is ignored.
//
// Prices: the store sells in QAR, so `Selling Price (QAR)` is the source
// of truth for Product.price. `Cost Price (INR)` is converted to QAR
// before it lands in Product.costPrice, because that column feeds COGS
// and margin reporting, which would be wrong against QAR revenue.
// ────────────────────────────────────────────────────────────────────

const INR_QAR_RATE_KEY = 'inrToQarRate';
// Fallback only — the `inrToQarRate` Setting wins once it's been set in
// admin. Update this when the rate drifts far enough to matter.
const DEFAULT_INR_QAR_RATE = 0.038;

async function getInrToQarRate() {
  const row = await Setting.findByPk(INR_QAR_RATE_KEY);
  const n = parseFloat(row?.value);
  return n > 0 ? n : DEFAULT_INR_QAR_RATE;
}

// "SKU\nCode", "SKU Code" and "sku code" all normalise to "sku code".
const normKey = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function normalizeRow(row) {
  const out = {};
  for (const k of Object.keys(row)) out[normKey(k)] = row[k];
  return out;
}

const cell = (row, name) => String(row[normKey(name)] ?? '').trim();

// "Red-5, Blue-3, Black-12" -> [{ color: 'Red', qty: 5 }, ...]
// An entry with no trailing quantity ("Red") yields qty null. The colour
// part may itself contain hyphens ("Off-White-5" -> Off-White, 5).
function parseVariantBreakdown(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = entry.match(/^(.*)[-–:]\s*(\d+)\s*$/);
      if (m && m[1].trim()) return { color: m[1].trim(), qty: parseInt(m[2], 10) };
      return { color: entry, qty: null };
    });
}

// Create any Category rows referenced by the sheet but not yet present.
async function ensureCategories(names) {
  const wanted = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
  if (!wanted.length) return 0;
  const existing = await Category.findAll({ where: { name: wanted }, attributes: ['name'] });
  const have = new Set(existing.map((c) => c.name));
  const toCreate = wanted.filter((n) => !have.has(n)).map((n) => ({ name: n, active: true, sortOrder: 0 }));
  if (toCreate.length) await Category.bulkCreate(toCreate, { ignoreDuplicates: true });
  return toCreate.length;
}

// Suppliers named in the sheet become master records so they're available
// for purchase orders. There is no Product->Supplier association in the
// schema, so the name is not stored on the product itself.
async function ensureSuppliers(names) {
  const wanted = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
  if (!wanted.length) return 0;
  const existing = await Supplier.findAll({ where: { name: wanted }, attributes: ['name'] });
  const have = new Set(existing.map((s) => s.name));
  const toCreate = wanted.filter((n) => !have.has(n)).map((n) => ({ name: n, active: true }));
  if (toCreate.length) await Supplier.bulkCreate(toCreate, { ignoreDuplicates: true });
  return toCreate.length;
}

// Slugs are permanent public URLs, so this only ever runs on create.
async function uniqueSlug(name, code) {
  const base = slugify(name) || slugify(code);
  const taken = await Product.findOne({ where: { slug: base }, attributes: ['id'] });
  return taken ? `${base}-${slugify(code)}` : base;
}

async function upsertStock(productId, variantIndex, locationId, quantity, reorderThreshold) {
  const patch = { quantity };
  if (Number.isInteger(reorderThreshold)) patch.reorderThreshold = reorderThreshold;
  const existing = await ProductStock.findOne({ where: { productId, variantIndex, locationId } });
  if (existing) await existing.update(patch);
  else await ProductStock.create({ productId, variantIndex, locationId, ...patch });
}

function stockStatus(qty, reorder) {
  if (!(qty > 0)) return 'Out of Stock';
  if (Number.isInteger(reorder) && qty <= reorder) return 'Low Stock';
  return 'In Stock';
}

const INVENTORY_HEADER = [
  { id: 'sl', title: 'SL No.' },
  { id: 'sku', title: 'SKU Code' },
  { id: 'name', title: 'Product Name' },
  { id: 'image', title: 'Product Image' },
  { id: 'category', title: 'Category' },
  { id: 'breakdown', title: 'Color / Variant Breakdown' },
  { id: 'totalQty', title: 'Total Stock Qty' },
  { id: 'costInr', title: 'Cost Price (INR)' },
  { id: 'markup', title: 'Markup %' },
  { id: 'sellInr', title: 'Selling Price (INR)' },
  { id: 'profit', title: 'Profit %' },
  { id: 'sellQar', title: 'Selling Price (QAR)' },
  { id: 'retailInr', title: 'Total Retail Value (INR)' },
  { id: 'shelf', title: 'Shelf / Location' },
  { id: 'reorder', title: 'Reorder Level' },
  { id: 'status', title: 'Stock Status' },
  { id: 'supplier', title: 'Supplier' },
];

// Discover header keys that look like `Stock - <Location Name>`.
// Returns [{ header, locName }] preserving original capitalisation.
function findLocationStockHeaders(sampleRow) {
  if (!sampleRow) return [];
  const out = [];
  for (const key of Object.keys(sampleRow)) {
    const m = key.match(/^\s*Stock\s*[-–]\s*(.+?)\s*$/i);
    if (m) out.push({ header: key, locName: m[1].trim() });
  }
  return out;
}

// Match a CSV location-stock column to an actual Location row, by name (CI) or code.
function resolveLocation(locName, locations) {
  const needle = locName.toLowerCase();
  return locations.find(
    (l) => l.name?.toLowerCase() === needle || l.code?.toLowerCase() === needle
  );
}

// Build variantOptions (e.g. { Size: ["S","M","L"] }) and variants array
// from a group of rows that share a Handle. Returns { variantOptions, variants }
// or { variantOptions: null, variants: null } for non-variant products.
function buildVariantsFromRows(group, basePrice) {
  // Collect option name -> ordered unique values across the group.
  const optMap = new Map(); // Map<name, Set<value>> (insertion-ordered)
  const variantRows = [];

  for (const row of group) {
    const variant = { options: {}, sku: null, price: null, comparePrice: null };
    let hasAnyOption = false;
    for (let i = 1; i <= 3; i++) {
      const name = String(rowGet(row, `Option${i} Name`, `option${i}Name`)).trim();
      const value = String(rowGet(row, `Option${i} Value`, `option${i}Value`)).trim();
      if (name && value) {
        variant.options[name] = value;
        if (!optMap.has(name)) optMap.set(name, new Set());
        optMap.get(name).add(value);
        hasAnyOption = true;
      }
    }
    if (!hasAnyOption) continue; // single-row product, no variants

    const sku = String(rowGet(row, 'Variant SKU', 'variantSku')).trim();
    if (sku) variant.sku = sku;
    const vp = parseFloatOrNull(rowGet(row, 'Variant Price', 'variantPrice'));
    if (vp !== null) variant.price = vp; else variant.price = null;
    const vcp = parseFloatOrNull(rowGet(row, 'Variant Compare Price', 'variantComparePrice'));
    if (vcp !== null) variant.comparePrice = vcp;
    variantRows.push(variant);
  }

  if (variantRows.length === 0) {
    return { variantOptions: null, variants: null };
  }
  const variantOptions = {};
  for (const [name, set] of optMap.entries()) variantOptions[name] = [...set];
  return { variantOptions, variants: variantRows };
}

// ────────────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────────────
function buildTemplateHeader(locationNames) {
  const base = [
    { id: 'handle', title: 'Handle' },
    { id: 'name', title: 'Name' },
    { id: 'nameAr', title: 'Name (AR)' },
    { id: 'code', title: 'Code' },
    { id: 'description', title: 'Description' },
    { id: 'descriptionAr', title: 'Description (AR)' },
    { id: 'category', title: 'Category' },
    { id: 'brand', title: 'Brand' },
    { id: 'price', title: 'Price' },
    { id: 'comparePrice', title: 'Compare Price' },
    { id: 'featured', title: 'Featured' },
    { id: 'active', title: 'Active' },
    { id: 'taxable', title: 'Taxable' },
    { id: 'taxRate', title: 'Tax Rate' },
    { id: 'hsnCode', title: 'HSN Code' },
    { id: 'weight', title: 'Weight (kg)' },
    { id: 'images', title: 'Images' },
    { id: 'option1Name', title: 'Option1 Name' },
    { id: 'option1Value', title: 'Option1 Value' },
    { id: 'option2Name', title: 'Option2 Name' },
    { id: 'option2Value', title: 'Option2 Value' },
    { id: 'option3Name', title: 'Option3 Name' },
    { id: 'option3Value', title: 'Option3 Value' },
    { id: 'variantSku', title: 'Variant SKU' },
    { id: 'variantPrice', title: 'Variant Price' },
    { id: 'variantComparePrice', title: 'Variant Compare Price' },
  ];
  const stockCols = locationNames.length
    ? locationNames.map((n) => ({ id: `stock_${slugify(n)}`, title: `Stock - ${n}` }))
    : [{ id: 'stock', title: 'Stock' }];
  return [...base, ...stockCols];
}

router.get('/template', protect, admin, async (req, res) => {
  try {
    const style = String(req.query.style || 'inventory').toLowerCase();

    if (style === 'inventory') {
      const csvStringifier = createObjectCsvStringifier({ header: INVENTORY_HEADER });
      const sample = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords([
        {
          sl: '1', sku: 'FMN-001', name: 'Sample Abaya', image: 'https://example.com/abaya.jpg',
          category: 'Abayas', breakdown: 'Black-12, Navy-8, Beige-5', totalQty: '25',
          costInr: '1200', markup: '150', sellInr: '3000', profit: '60', sellQar: '114.000',
          retailInr: '75000', shelf: '', reorder: '5', status: 'In Stock', supplier: 'Delhi Textiles',
        },
        {
          sl: '2', sku: 'FMN-002', name: 'Sample Scarf', image: 'https://example.com/scarf.jpg',
          category: 'Accessories', breakdown: '', totalQty: '40',
          costInr: '250', markup: '120', sellInr: '550', profit: '54.5', sellQar: '20.900',
          retailInr: '22000', shelf: '', reorder: '10', status: 'In Stock', supplier: 'Surat Silk Co',
        },
      ]);
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=product-import-template.csv',
      });
      return res.send(sample);
    }

    if (style === 'simple') {
      const csvStringifier = createObjectCsvStringifier({
        header: [
          { id: 'name', title: 'Name' },
          { id: 'code', title: 'Code' },
          { id: 'description', title: 'Description' },
          { id: 'price', title: 'Price' },
          { id: 'comparePrice', title: 'Compare Price' },
          { id: 'category', title: 'Category' },
          { id: 'brand', title: 'Brand' },
          { id: 'stock', title: 'Stock' },
          { id: 'featured', title: 'Featured' },
          { id: 'taxable', title: 'Taxable' },
          { id: 'taxRate', title: 'Tax Rate' },
          { id: 'hsnCode', title: 'HSN Code' },
        ],
      });
      const sample = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords([
        { name: 'Sample Product', code: 'PROD-001', description: 'A great product', price: '49.999', comparePrice: '69.999', category: 'Footwear', brand: 'BrandX', stock: '50', featured: 'No', taxable: 'Yes', taxRate: '0', hsnCode: '' },
      ]);
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename=product-import-template-simple.csv',
      });
      return res.send(sample);
    }

    // Full template — show every column, with realistic sample rows
    // including a variant product that spans 3 rows.
    const locations = await Location.findAll({
      where: { active: true },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
      attributes: ['name'],
      raw: true,
    });
    const locationNames = locations.map((l) => l.name);

    const header = buildTemplateHeader(locationNames);
    const csvStringifier = createObjectCsvStringifier({ header });

    // Sample 1: simple product, no variants
    const simpleRow = {
      handle: 'sample-shaker-bottle',
      name: 'Sample Shaker Bottle',
      nameAr: 'زجاجة شيكر',
      code: 'SHK-001',
      description: '750ml stainless shaker for the gym.',
      descriptionAr: 'شيكر ستانلس ستيل سعة 750 مل لصالة الجيم.',
      category: 'Accessories',
      brand: 'BrandX',
      price: '4.500',
      comparePrice: '6.000',
      featured: 'No',
      active: 'Yes',
      taxable: 'No',
      taxRate: '0',
      hsnCode: '',
      weight: '0.250',
      images: 'https://example.com/img1.jpg|https://example.com/img2.jpg',
      option1Name: '', option1Value: '',
      option2Name: '', option2Value: '',
      option3Name: '', option3Value: '',
      variantSku: '', variantPrice: '', variantComparePrice: '',
    };
    // Sample 2 + 3 + 4: a variant product (running shoe) with 3 sizes
    const v1 = {
      handle: 'sample-running-shoe',
      name: 'Sample Running Shoe',
      nameAr: 'حذاء جري',
      code: 'RS-100',
      description: 'Lightweight road runner.',
      descriptionAr: 'حذاء جري خفيف الوزن للطرق.',
      category: 'Footwear',
      brand: 'BrandY',
      price: '24.500',
      comparePrice: '',
      featured: 'Yes',
      active: 'Yes',
      taxable: 'No',
      taxRate: '0',
      hsnCode: '',
      weight: '0.600',
      images: 'https://example.com/shoe1.jpg',
      option1Name: 'Size', option1Value: 'UK 8',
      option2Name: '', option2Value: '',
      option3Name: '', option3Value: '',
      variantSku: 'RS-100-UK8',
      variantPrice: '',
      variantComparePrice: '',
    };
    const v2 = { ...emptyVariantRow(),
      handle: 'sample-running-shoe',
      option1Name: 'Size', option1Value: 'UK 9',
      variantSku: 'RS-100-UK9',
    };
    const v3 = { ...emptyVariantRow(),
      handle: 'sample-running-shoe',
      option1Name: 'Size', option1Value: 'UK 10',
      variantSku: 'RS-100-UK10',
    };

    // Fill in sample per-location stock or fall back to plain Stock
    if (locationNames.length) {
      for (const n of locationNames) {
        const col = `stock_${slugify(n)}`;
        simpleRow[col] = '50';
        v1[col] = '5';
        v2[col] = '4';
        v3[col] = '2';
      }
    } else {
      simpleRow.stock = '50';
      v1.stock = '5';
      v2.stock = '4';
      v3.stock = '2';
    }

    const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords([simpleRow, v1, v2, v3]);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=product-import-template-full.csv',
    });
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

function emptyVariantRow() {
  return {
    handle: '', name: '', nameAr: '', code: '', description: '', descriptionAr: '',
    category: '', brand: '', price: '', comparePrice: '',
    featured: '', active: '', taxable: '', taxRate: '', hsnCode: '', weight: '', images: '',
    option1Name: '', option1Value: '', option2Name: '', option2Value: '', option3Name: '', option3Value: '',
    variantSku: '', variantPrice: '', variantComparePrice: '',
  };
}

// ────────────────────────────────────────────────────────────────────
// Export — one row per variant for products with variants
// ────────────────────────────────────────────────────────────────────
router.get('/export', protect, admin, async (req, res) => {
  try {
    // Default to the inventory stock sheet; `?style=full` still emits the
    // Shopify-style shape, which is the only one that round-trips Arabic,
    // multi-option variants and per-location stock.
    if (String(req.query.style || 'inventory').toLowerCase() !== 'full') {
      return exportInventorySheet(res);
    }

    const products = await Product.findAll({ order: [['id', 'ASC']], raw: true });
    const locations = await Location.findAll({
      where: { active: true },
      order: [['sortOrder', 'ASC'], ['id', 'ASC']],
      attributes: ['id', 'name'],
      raw: true,
    });
    const allStocks = await ProductStock.findAll({ raw: true });
    // Map: productId -> variantIndex(null|number) -> locationId -> quantity
    const stockMap = new Map();
    for (const s of allStocks) {
      if (!stockMap.has(s.productId)) stockMap.set(s.productId, new Map());
      const byVar = stockMap.get(s.productId);
      const vKey = s.variantIndex == null ? '_' : String(s.variantIndex);
      if (!byVar.has(vKey)) byVar.set(vKey, new Map());
      byVar.get(vKey).set(s.locationId, s.quantity);
    }

    const header = [
      { id: 'id', title: 'ID' },
      { id: 'handle', title: 'Handle' },
      { id: 'name', title: 'Name' },
      { id: 'nameAr', title: 'Name (AR)' },
      { id: 'code', title: 'Code' },
      { id: 'description', title: 'Description' },
      { id: 'descriptionAr', title: 'Description (AR)' },
      { id: 'category', title: 'Category' },
      { id: 'brand', title: 'Brand' },
      { id: 'price', title: 'Price' },
      { id: 'comparePrice', title: 'Compare Price' },
      { id: 'featured', title: 'Featured' },
      { id: 'active', title: 'Active' },
      { id: 'taxable', title: 'Taxable' },
      { id: 'taxRate', title: 'Tax Rate' },
      { id: 'hsnCode', title: 'HSN Code' },
      { id: 'weight', title: 'Weight (kg)' },
      { id: 'images', title: 'Images' },
      { id: 'option1Name', title: 'Option1 Name' },
      { id: 'option1Value', title: 'Option1 Value' },
      { id: 'option2Name', title: 'Option2 Name' },
      { id: 'option2Value', title: 'Option2 Value' },
      { id: 'option3Name', title: 'Option3 Name' },
      { id: 'option3Value', title: 'Option3 Value' },
      { id: 'variantSku', title: 'Variant SKU' },
      { id: 'variantPrice', title: 'Variant Price' },
      { id: 'variantComparePrice', title: 'Variant Compare Price' },
      ...locations.map((l) => ({ id: `stock_${slugify(l.name)}`, title: `Stock - ${l.name}` })),
    ];
    if (locations.length === 0) header.push({ id: 'stock', title: 'Stock' });

    const csvStringifier = createObjectCsvStringifier({ header });
    const rows = [];

    for (const p of products) {
      const imagesStr = Array.isArray(p.images) ? p.images.join('|') : (p.images || '');
      const variants = Array.isArray(p.variants) ? p.variants : null;
      const variantOptionsObj = p.variantOptions && typeof p.variantOptions === 'object' ? p.variantOptions : null;
      const optionNames = variantOptionsObj ? Object.keys(variantOptionsObj) : [];

      const fillStockCols = (varIdx) => {
        const out = {};
        const byVar = stockMap.get(p.id);
        const vMap = byVar ? byVar.get(varIdx == null ? '_' : String(varIdx)) : null;
        if (locations.length) {
          for (const l of locations) {
            const col = `stock_${slugify(l.name)}`;
            out[col] = vMap ? (vMap.get(l.id) ?? 0) : 0;
          }
        } else {
          out.stock = p.stock ?? 0;
        }
        return out;
      };

      if (variants && variants.length) {
        // Emit one row per variant. Parent fields only on first row.
        variants.forEach((v, idx) => {
          const isFirst = idx === 0;
          rows.push({
            id: isFirst ? p.id : '',
            handle: p.slug,
            name: isFirst ? p.name : '',
            nameAr: isFirst ? (p.nameAr || '') : '',
            code: isFirst ? (p.code || '') : '',
            description: isFirst ? (p.description || '') : '',
            descriptionAr: isFirst ? (p.descriptionAr || '') : '',
            category: isFirst ? p.category : '',
            brand: isFirst ? (p.brand || '') : '',
            price: isFirst ? p.price : '',
            comparePrice: isFirst ? (p.comparePrice ?? '') : '',
            featured: isFirst ? (p.featured ? 'Yes' : 'No') : '',
            active: isFirst ? (p.active ? 'Yes' : 'No') : '',
            taxable: isFirst ? (p.taxable ? 'Yes' : 'No') : '',
            taxRate: isFirst ? (p.taxRate ?? 0) : '',
            hsnCode: isFirst ? (p.hsnCode || '') : '',
            weight: isFirst ? (p.weight ?? '') : '',
            images: isFirst ? imagesStr : '',
            option1Name: optionNames[0] || '',
            option1Value: optionNames[0] ? (v.options?.[optionNames[0]] || '') : '',
            option2Name: optionNames[1] || '',
            option2Value: optionNames[1] ? (v.options?.[optionNames[1]] || '') : '',
            option3Name: optionNames[2] || '',
            option3Value: optionNames[2] ? (v.options?.[optionNames[2]] || '') : '',
            variantSku: v.sku || '',
            variantPrice: v.price ?? '',
            variantComparePrice: v.comparePrice ?? '',
            ...fillStockCols(idx),
          });
        });
      } else {
        rows.push({
          id: p.id,
          handle: p.slug,
          name: p.name,
          nameAr: p.nameAr || '',
          code: p.code || '',
          description: p.description || '',
          descriptionAr: p.descriptionAr || '',
          category: p.category,
          brand: p.brand || '',
          price: p.price,
          comparePrice: p.comparePrice ?? '',
          featured: p.featured ? 'Yes' : 'No',
          active: p.active ? 'Yes' : 'No',
          taxable: p.taxable ? 'Yes' : 'No',
          taxRate: p.taxRate ?? 0,
          hsnCode: p.hsnCode || '',
          weight: p.weight ?? '',
          images: imagesStr,
          option1Name: '', option1Value: '',
          option2Name: '', option2Value: '',
          option3Name: '', option3Value: '',
          variantSku: '', variantPrice: '', variantComparePrice: '',
          ...fillStockCols(null),
        });
      }
    }

    const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(rows);
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=products-${new Date().toISOString().split('T')[0]}.csv`,
    });
    res.send(csv);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Export in the inventory stock-sheet shape — one row per product, with
// the colour split folded back into a single breakdown cell and the INR
// figures recomputed from the stored QAR values.
async function exportInventorySheet(res) {
  const rate = await getInrToQarRate();
  const products = await Product.findAll({ order: [['id', 'ASC']], raw: true });
  const stocks = await ProductStock.findAll({ raw: true });

  // productId -> variantIndex ('_' for none) -> { qty, reorder }
  const byProduct = new Map();
  for (const s of stocks) {
    if (!byProduct.has(s.productId)) byProduct.set(s.productId, new Map());
    const key = s.variantIndex == null ? '_' : String(s.variantIndex);
    const prev = byProduct.get(s.productId).get(key) || { qty: 0, reorder: null };
    byProduct.get(s.productId).set(key, {
      qty: prev.qty + (s.quantity || 0),
      reorder: prev.reorder ?? s.reorderThreshold ?? null,
    });
  }

  const rows = products.map((p, i) => {
    const variants = Array.isArray(p.variants) ? p.variants : null;
    const perVariant = byProduct.get(p.id) || new Map();
    const optionName = p.variantOptions && typeof p.variantOptions === 'object'
      ? Object.keys(p.variantOptions)[0] : null;

    let breakdown = '';
    let reorder = perVariant.get('_')?.reorder ?? null;
    if (variants && variants.length) {
      breakdown = variants.map((v, idx) => {
        const label = optionName ? (v.options?.[optionName] ?? '') : '';
        const qty = perVariant.get(String(idx))?.qty ?? 0;
        if (reorder == null) reorder = perVariant.get(String(idx))?.reorder ?? null;
        return label ? `${label}-${qty}` : '';
      }).filter(Boolean).join(', ');
    }

    const totalQty = p.stock ?? 0;
    const sellQar = Number(p.price) || 0;
    const costQar = p.costPrice == null ? null : Number(p.costPrice);
    const sellInr = sellQar / rate;
    const costInr = costQar == null ? null : costQar / rate;
    const round = (n) => (n == null ? '' : n.toFixed(2));

    return {
      sl: i + 1,
      sku: p.code || '',
      name: p.name,
      image: Array.isArray(p.images) ? (p.images[0] || '') : (p.images || ''),
      category: p.category,
      breakdown,
      totalQty,
      costInr: round(costInr),
      markup: costInr ? (((sellInr - costInr) / costInr) * 100).toFixed(1) : '',
      sellInr: round(sellInr),
      profit: costInr && sellInr ? (((sellInr - costInr) / sellInr) * 100).toFixed(1) : '',
      sellQar: sellQar.toFixed(3),
      retailInr: round(sellInr * totalQty),
      shelf: '',
      reorder: reorder ?? '',
      status: stockStatus(totalQty, reorder),
      supplier: '',
    };
  });

  const csvStringifier = createObjectCsvStringifier({ header: INVENTORY_HEADER });
  const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(rows);
  res.set({
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename=products-${new Date().toISOString().split('T')[0]}.csv`,
  });
  res.send(csv);
}

// ────────────────────────────────────────────────────────────────────
// Import
// ────────────────────────────────────────────────────────────────────
router.post('/import', protect, admin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const rows = [];
    await new Promise((resolve, reject) => {
      // Excel prefixes CSV exports with a BOM, which would otherwise become
      // part of the first header name and break the column lookup.
      const stream = Readable.from(req.file.buffer.toString().replace(/^﻿/, ''));
      stream
        .pipe(csvParser())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    if (rows.length === 0) return res.status(400).json({ message: 'CSV file is empty' });

    // Detect format by header. Only the stock sheet has an "SKU Code"
    // column; only the Shopify-style format has "Handle"; anything else
    // falls through to the legacy single-row importer.
    const headerKeys = Object.keys(rows[0]);
    if (headerKeys.some((k) => normKey(k) === 'sku code')) {
      return importInventorySheet(rows, res);
    }
    const hasHandle = headerKeys.some((k) => k.toLowerCase() === 'handle');

    if (!hasHandle) {
      // Legacy single-row mode — keep old behaviour intact.
      return importLegacy(rows, res);
    }

    return importHandleGrouped(rows, res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Inventory stock-sheet importer ──────────────────────────────────
// Keyed on SKU Code: an existing product with that code is updated in
// place, otherwise a new one is created. Slugs are only assigned on
// create, so renaming a product in the sheet never breaks its URL.
async function importInventorySheet(rawRows, res) {
  const rows = rawRows.map(normalizeRow);
  const rate = await getInrToQarRate();

  const locations = await Location.findAll({ where: { active: true }, raw: true });
  const stockLoc = locations.find((l) => l.isOnlineDefault) || locations[0] || null;

  const categoriesCreated = await ensureCategories(rows.map((r) => cell(r, 'Category')));
  const suppliersCreated = await ensureSuppliers(rows.map((r) => cell(r, 'Supplier')));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  if (!stockLoc) errors.push('No active location configured — stock quantities were not recorded.');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const name = cell(row, 'Product Name');
      const code = cell(row, 'SKU Code');
      if (!name && !code) { skipped++; continue; } // trailing blank sheet row
      if (!name) { errors.push(`Row ${rowNum}: Product Name is required`); skipped++; continue; }
      if (!code) { errors.push(`Row ${rowNum}: SKU Code is required for "${name}"`); skipped++; continue; }

      const price = parseFloat(cell(row, 'Selling Price (QAR)'));
      if (isNaN(price) || price <= 0) {
        errors.push(`Row ${rowNum}: Invalid Selling Price (QAR) for "${name}"`);
        skipped++; continue;
      }

      const costInr = parseFloatOrNull(cell(row, 'Cost Price (INR)'));
      const breakdown = parseVariantBreakdown(cell(row, 'Color / Variant Breakdown'));
      const totalRaw = parseInt(cell(row, 'Total Stock Qty'), 10);
      const totalQty = isNaN(totalRaw) ? 0 : totalRaw;
      const reorderRaw = parseInt(cell(row, 'Reorder Level'), 10);
      const reorder = isNaN(reorderRaw) ? null : reorderRaw;

      const productData = {
        name,
        code,
        price,
        // Stored in QAR so COGS and margin match QAR revenue.
        costPrice: costInr === null ? null : Number((costInr * rate).toFixed(3)),
        category: cell(row, 'Category') || 'Uncategorized',
        variantOptions: breakdown.length ? { Color: breakdown.map((b) => b.color) } : null,
        variants: breakdown.length
          ? breakdown.map((b) => ({
              options: { Color: b.color },
              sku: `${code}-${slugify(b.color)}`,
              price: null,
              comparePrice: null,
            }))
          : null,
      };
      const img = cell(row, 'Product Image');
      if (img) productData.images = img.split('|').map((s) => s.trim()).filter(Boolean);

      let product = await Product.findOne({ where: { code } });
      if (product) {
        await product.update(productData);
        updated++;
      } else {
        product = await Product.create({ ...productData, slug: await uniqueSlug(name, code) });
        created++;
      }

      if (stockLoc) {
        if (breakdown.length) {
          for (let v = 0; v < breakdown.length; v++) {
            await upsertStock(product.id, v, stockLoc.id, breakdown[v].qty ?? 0, reorder);
          }
        } else {
          await upsertStock(product.id, null, stockLoc.id, totalQty, reorder);
        }
      }
      await recomputeProductStock(product.id);

      // Total Stock Qty is a spreadsheet sum, so a mismatch means the sheet
      // is internally inconsistent. The colour breakdown wins.
      const counted = breakdown.filter((b) => b.qty !== null);
      if (counted.length && !isNaN(totalRaw)) {
        const sum = counted.reduce((a, b) => a + b.qty, 0);
        if (sum !== totalRaw) {
          errors.push(`Row ${rowNum} ("${name}"): colour quantities total ${sum} but Total Stock Qty says ${totalRaw} — used the breakdown`);
        }
      }
    } catch (err) {
      errors.push(`Row ${rowNum}: ${err.message}`);
      skipped++;
    }
  }

  const extras = [
    categoriesCreated ? `${categoriesCreated} new categories` : '',
    suppliersCreated ? `${suppliersCreated} new suppliers` : '',
  ].filter(Boolean);

  return res.json({
    message: `Import complete: ${created} created, ${updated} updated, ${skipped} skipped`
      + (extras.length ? `, ${extras.join(', ')}` : ''),
    created,
    updated,
    skipped,
    categoriesCreated,
    suppliersCreated,
    inrToQarRate: rate,
    total: rows.length,
    errors: errors.slice(0, 20),
  });
}

// ── New handle-grouped importer ─────────────────────────────────────
async function importHandleGrouped(rows, res) {
  // Bootstrap: load locations and stock-column header map.
  const locations = await Location.findAll({ where: { active: true }, raw: true });
  const onlineDefaultLoc = locations.find((l) => l.isOnlineDefault) || locations[0] || null;
  const stockHeaders = findLocationStockHeaders(rows[0]);
  // Resolve each stock-column to a Location row. Unmatched columns are flagged.
  const stockCols = stockHeaders.map((h) => ({
    header: h.header,
    locName: h.locName,
    location: resolveLocation(h.locName, locations),
  }));

  // Auto-create any new categories referenced in the CSV.
  const csvCategoryNames = [...new Set(
    rows.map((r) => String(rowGet(r, 'Category') || '').trim()).filter(Boolean)
  )];
  let categoriesCreated = 0;
  if (csvCategoryNames.length) {
    const existing = await Category.findAll({ where: { name: csvCategoryNames }, attributes: ['name'] });
    const existingNames = new Set(existing.map((c) => c.name));
    const toCreate = csvCategoryNames
      .filter((n) => !existingNames.has(n))
      .map((n) => ({ name: n, active: true, sortOrder: 0 }));
    if (toCreate.length) {
      await Category.bulkCreate(toCreate, { ignoreDuplicates: true });
      categoriesCreated = toCreate.length;
    }
  }

  // Group rows by handle, preserving order.
  const groups = new Map(); // handle -> { firstRowIdx, rows: [] }
  rows.forEach((row, i) => {
    const handle = String(rowGet(row, 'Handle') || '').trim();
    if (!handle) return; // rows without a handle are skipped at row-level below
    if (!groups.has(handle)) groups.set(handle, { firstRowIdx: i, rows: [] });
    groups.get(handle).rows.push({ row, csvRowNum: i + 2 });
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  // Track unmatched stock-column warnings (emit once)
  for (const sc of stockCols) {
    if (!sc.location) errors.push(`Stock column "${sc.header}" doesn't match any active location — values ignored.`);
  }

  // Rows missing Handle
  rows.forEach((row, i) => {
    if (!String(rowGet(row, 'Handle') || '').trim()) {
      errors.push(`Row ${i + 2}: Handle is required (row skipped)`);
      skipped++;
    }
  });

  for (const [handle, group] of groups.entries()) {
    const firstRow = group.rows[0].row;
    const rowNum = group.rows[0].csvRowNum;

    try {
      const name = String(rowGet(firstRow, 'Name') || '').trim();
      if (!name) {
        errors.push(`Row ${rowNum} (handle "${handle}"): Name is required`);
        skipped += group.rows.length;
        continue;
      }
      const price = parseFloat(rowGet(firstRow, 'Price'));
      if (isNaN(price) || price <= 0) {
        errors.push(`Row ${rowNum} (handle "${handle}"): Invalid price for "${name}"`);
        skipped += group.rows.length;
        continue;
      }

      const slug = slugify(handle);
      if (!slug) {
        errors.push(`Row ${rowNum}: Handle "${handle}" is invalid after slugifying`);
        skipped += group.rows.length;
        continue;
      }

      // Build variant structure from the group
      const { variantOptions, variants } = buildVariantsFromRows(group.rows.map((g) => g.row), price);

      const productData = {
        name,
        slug,
        nameAr: String(rowGet(firstRow, 'Name (AR)', 'nameAr') || '').trim() || null,
        code: String(rowGet(firstRow, 'Code') || '').trim() || null,
        description: rowGet(firstRow, 'Description') || '',
        descriptionAr: String(rowGet(firstRow, 'Description (AR)', 'descriptionAr') || '').trim() || null,
        price,
        comparePrice: parseFloatOrNull(rowGet(firstRow, 'Compare Price', 'comparePrice')),
        category: String(rowGet(firstRow, 'Category') || '').trim() || 'Uncategorized',
        brand: String(rowGet(firstRow, 'Brand') || '').trim() || null,
        featured: truthy(rowGet(firstRow, 'Featured')),
        active: rowGet(firstRow, 'Active') === '' ? true : truthy(rowGet(firstRow, 'Active')),
        taxable: truthy(rowGet(firstRow, 'Taxable')),
        taxRate: parseFloat(rowGet(firstRow, 'Tax Rate', 'taxRate')) || 0,
        hsnCode: String(rowGet(firstRow, 'HSN Code', 'hsnCode') || '').trim() || null,
        weight: parseFloatOrNull(rowGet(firstRow, 'Weight (kg)', 'weight')),
        variantOptions,
        variants,
      };

      const imgField = rowGet(firstRow, 'Images');
      if (imgField) productData.images = String(imgField).split('|').map((s) => s.trim()).filter(Boolean);

      // Upsert: by ID if supplied, else by slug.
      const existingId = parseInt(rowGet(firstRow, 'ID'), 10);
      let product;
      let didCreate = false;
      if (existingId) {
        product = await Product.findByPk(existingId);
        if (product) await product.update(productData);
      }
      if (!product) {
        const bySlug = await Product.findOne({ where: { slug } });
        if (bySlug) {
          await bySlug.update(productData);
          product = bySlug;
        } else {
          product = await Product.create(productData);
          didCreate = true;
        }
      }
      if (didCreate) created++; else updated++;

      // Write ProductStock rows from per-variant per-location columns.
      // Strategy: for each row in the group → determine its variantIndex
      // (null if no variants, else the index of the variant we just built),
      // then for each resolved stock column write a ProductStock upsert.
      const variantList = variants || [];
      for (let i = 0; i < group.rows.length; i++) {
        const r = group.rows[i].row;
        let vIdx = null;
        if (variantList.length) {
          // Match the row to its position in the variants array (by option values).
          const want = {};
          for (let n = 1; n <= 3; n++) {
            const nName = String(rowGet(r, `Option${n} Name`)).trim();
            const nVal = String(rowGet(r, `Option${n} Value`)).trim();
            if (nName && nVal) want[nName] = nVal;
          }
          if (Object.keys(want).length === 0) continue; // row had no options in a variant product — skip stock
          vIdx = variantList.findIndex((v) => {
            const opts = v.options || {};
            const keys = new Set([...Object.keys(opts), ...Object.keys(want)]);
            for (const k of keys) if (opts[k] !== want[k]) return false;
            return true;
          });
          if (vIdx < 0) continue;
        }

        if (stockCols.length) {
          for (const sc of stockCols) {
            if (!sc.location) continue;
            const qtyRaw = rowGet(r, sc.header);
            if (qtyRaw === '' || qtyRaw == null) continue;
            const qty = Math.max(0, parseInt(qtyRaw, 10) || 0);
            const existing = await ProductStock.findOne({
              where: { productId: product.id, variantIndex: vIdx, locationId: sc.location.id },
            });
            if (existing) await existing.update({ quantity: qty });
            else await ProductStock.create({ productId: product.id, variantIndex: vIdx, locationId: sc.location.id, quantity: qty });
          }
        } else {
          // No per-location columns → fall back to plain Stock on the online-default location
          const qtyRaw = rowGet(r, 'Stock');
          if (qtyRaw === '' || qtyRaw == null) continue;
          if (!onlineDefaultLoc) continue;
          const qty = Math.max(0, parseInt(qtyRaw, 10) || 0);
          const existing = await ProductStock.findOne({
            where: { productId: product.id, variantIndex: vIdx, locationId: onlineDefaultLoc.id },
          });
          if (existing) await existing.update({ quantity: qty });
          else await ProductStock.create({ productId: product.id, variantIndex: vIdx, locationId: onlineDefaultLoc.id, quantity: qty });
        }
      }

      await recomputeProductStock(product.id);
    } catch (err) {
      errors.push(`Row ${rowNum} (handle "${handle}"): ${err.message}`);
      skipped += group.rows.length;
    }
  }

  const catMsg = categoriesCreated > 0 ? `, ${categoriesCreated} new categories` : '';
  return res.json({
    message: `Import complete: ${created} created, ${updated} updated, ${skipped} skipped${catMsg}`,
    created,
    updated,
    skipped,
    categoriesCreated,
    total: groups.size,
    errors: errors.slice(0, 20),
  });
}

// ── Legacy single-row importer (no Handle column) ───────────────────
// Preserves the pre-existing behaviour exactly so old CSV templates
// still work. No variants, no per-location stock.
async function importLegacy(results, res) {
  const errors = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let categoriesCreated = 0;

  const csvCategoryNames = [...new Set(
    results.map((row) => (row.Category || row.category || '').trim()).filter(Boolean)
  )];
  if (csvCategoryNames.length) {
    const existing = await Category.findAll({ where: { name: csvCategoryNames }, attributes: ['name'] });
    const existingNames = new Set(existing.map((c) => c.name));
    const toCreate = csvCategoryNames
      .filter((n) => !existingNames.has(n))
      .map((n) => ({ name: n, active: true, sortOrder: 0 }));
    if (toCreate.length) {
      await Category.bulkCreate(toCreate, { ignoreDuplicates: true });
      categoriesCreated = toCreate.length;
    }
  }

  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    const rowNum = i + 2;
    try {
      if (!row.Name && !row.name) {
        errors.push(`Row ${rowNum}: Name is required`);
        skipped++; continue;
      }
      const name = row.Name || row.name;
      const price = parseFloat(row.Price || row.price);
      if (isNaN(price) || price <= 0) {
        errors.push(`Row ${rowNum}: Invalid price for "${name}"`);
        skipped++; continue;
      }
      const slug = slugify(name);
      const productData = {
        name, slug,
        code: (row.Code || row.code || '').trim() || null,
        description: row.Description || row.description || '',
        price,
        comparePrice: parseFloatOrNull(row['Compare Price'] || row.comparePrice),
        category: row.Category || row.category || 'Uncategorized',
        brand: row.Brand || row.brand || null,
        stock: parseInt(row.Stock || row.stock, 10) || 0,
        featured: truthy(row.Featured || row.featured),
        active: row.Active !== undefined ? truthy(row.Active || row.active) : true,
        taxable: truthy(row.Taxable || row.taxable),
        taxRate: parseFloat(row['Tax Rate'] || row.taxRate) || 0,
        hsnCode: row['HSN Code'] || row.hsnCode || null,
      };
      const imgField = row.Images || row.images;
      if (imgField) productData.images = imgField.split('|').map((s) => s.trim()).filter(Boolean);

      const existingId = parseInt(row.ID || row.id, 10);
      if (existingId) {
        const existing = await Product.findByPk(existingId);
        if (existing) { await existing.update(productData); updated++; continue; }
      }
      const existingBySlug = await Product.findOne({ where: { slug } });
      if (existingBySlug) { await existingBySlug.update(productData); updated++; }
      else { await Product.create(productData); created++; }
    } catch (err) {
      errors.push(`Row ${rowNum}: ${err.message}`);
      skipped++;
    }
  }

  const catMsg = categoriesCreated > 0 ? `, ${categoriesCreated} new categories` : '';
  return res.json({
    message: `Import complete: ${created} created, ${updated} updated, ${skipped} skipped${catMsg}`,
    created, updated, skipped, categoriesCreated,
    total: results.length,
    errors: errors.slice(0, 10),
  });
}

export default router;
