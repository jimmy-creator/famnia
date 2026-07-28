import { Router } from 'express';
import { Product, Category, Location, ProductStock, recomputeProductStock } from '../models/index.js';
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
    const style = String(req.query.style || 'full').toLowerCase();

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
      'Content-Disposition': 'attachment; filename=product-import-template.csv',
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

// ────────────────────────────────────────────────────────────────────
// Import
// ────────────────────────────────────────────────────────────────────
router.post('/import', protect, admin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const rows = [];
    await new Promise((resolve, reject) => {
      const stream = Readable.from(req.file.buffer.toString());
      stream
        .pipe(csvParser())
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    if (rows.length === 0) return res.status(400).json({ message: 'CSV file is empty' });

    // Detect format. New format has a Handle column.
    const headerKeys = Object.keys(rows[0]);
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
