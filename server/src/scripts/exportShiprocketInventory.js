/**
 * One-off CSV generator for Shiprocket's inventory bulk-upload format.
 *
 * Run with:
 *   cd server && npm run export:shiprocket > inventory.csv
 *
 * Or with overrides:
 *   WAREHOUSE_PINCODE=673638 DEFAULT_LENGTH=20 npm run export:shiprocket > inventory.csv
 *
 * Output columns (per Shiprocket's SampleInventory.csv):
 *   sku, pincode, hsn, name, quantity, weight, length, breadth, height
 *
 * Each variant gets its own row. Edit the CSV by hand to set real
 * length / breadth / height per SKU before uploading to Shiprocket.
 */
import 'dotenv/config';
import sequelize from '../config/database.js';
import { Product } from '../models/index.js';
import { parseWeightFromOptions } from '../utils/productWeight.js';

const PINCODE_DEFAULT = process.env.WAREHOUSE_PINCODE || '673638';   // Kondotty
const WEIGHT_DEFAULT = parseFloat(process.env.DEFAULT_WEIGHT || '0.1');     // kg
const LENGTH_DEFAULT = parseFloat(process.env.DEFAULT_LENGTH || '15');      // cm
const BREADTH_DEFAULT = parseFloat(process.env.DEFAULT_BREADTH || '10');    // cm
const HEIGHT_DEFAULT = parseFloat(process.env.DEFAULT_HEIGHT || '5');       // cm

function pick(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue;
    const n = parseFloat(v);
    if (!isNaN(n)) return n;
  }
  return null;
}

function pickInt(...vals) {
  const n = pick(...vals);
  return n == null ? 0 : Math.round(n);
}

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values) {
  return values.map(csvEscape).join(',');
}

async function main() {
  await sequelize.authenticate();

  const products = await Product.findAll({
    where: { active: true },
    order: [['id', 'ASC']],
  });

  const lines = [];
  lines.push(row(['sku', 'pincode', 'hsn', 'name', 'quantity', 'weight', 'length', 'breadth', 'height']));

  let rowsWritten = 0;

  for (const p of products) {
    const obj = p.toJSON();
    const hasVariants = Array.isArray(obj.variants) && obj.variants.length > 0;

    if (hasVariants) {
      for (let idx = 0; idx < obj.variants.length; idx++) {
        const v = obj.variants[idx];
        const optionLabel = v.options ? Object.values(v.options).join('/') : `Variant ${idx + 1}`;
        const sku = v.sku || obj.code || `P${obj.id}-V${idx}`;
        const qty = pickInt(v.stock, obj.stock, 0);
        const weight = pick(v.weight, parseWeightFromOptions(v.options), obj.weight) ?? WEIGHT_DEFAULT;
        lines.push(row([
          sku,
          PINCODE_DEFAULT,
          obj.hsnCode || '',
          `${obj.name} (${optionLabel})`,
          qty,
          weight,
          LENGTH_DEFAULT,
          BREADTH_DEFAULT,
          HEIGHT_DEFAULT,
        ]));
        rowsWritten++;
      }
    } else {
      const sku = obj.code || `P${obj.id}`;
      const qty = pickInt(obj.stock, 0);
      const weight = pick(obj.weight) ?? WEIGHT_DEFAULT;
      lines.push(row([
        sku,
        PINCODE_DEFAULT,
        obj.hsnCode || '',
        obj.name,
        qty,
        weight,
        LENGTH_DEFAULT,
        BREADTH_DEFAULT,
        HEIGHT_DEFAULT,
      ]));
      rowsWritten++;
    }
  }

  console.log(lines.join('\n'));
  console.error(`\n[exportShiprocketInventory] ${rowsWritten} rows from ${products.length} products`);
  console.error(`[exportShiprocketInventory] defaults: pincode=${PINCODE_DEFAULT} L=${LENGTH_DEFAULT}cm B=${BREADTH_DEFAULT}cm H=${HEIGHT_DEFAULT}cm`);

  await sequelize.close();
}

main().catch((err) => {
  console.error('[exportShiprocketInventory] failed:', err);
  process.exit(1);
});
