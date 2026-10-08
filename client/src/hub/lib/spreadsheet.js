/**
 * Spreadsheet helpers for the hub import wizards and Excel exports.
 *
 * Workbooks are parsed with displayed values only (formulas are ignored, never
 * evaluated), macro-enabled and password protected files are rejected, and every
 * exported cell is escaped so a downloaded report can never be turned into a
 * spreadsheet formula.
 */
import * as XLSX from 'xlsx';

import { today } from '@/hub/lib/format';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

const ALLOWED_EXTENSIONS = ['.xlsx', '.csv'];
const BLOCKED_EXTENSIONS = ['.xlsm', '.xlsb', '.xltm', '.xls'];

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads a user supplied .xlsx/.csv file entirely in memory — nothing is stored. */
export async function readImportFile(file) {
  const lower = file.name.toLowerCase();
  if (BLOCKED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new Error('Macro-enabled and legacy workbooks are not accepted. Save the file as .xlsx or .csv.');
  }
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new Error('Only .xlsx and .csv files can be imported.');
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`This file is too large. The limit is ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB.`);
  }

  const buffer = await file.arrayBuffer();
  const fileHash = await sha256Hex(buffer);

  let workbook;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true, cellFormula: false });
  } catch (error) {
    const message = error?.message ?? '';
    if (/password|encrypt/i.test(message)) {
      throw new Error('This file is password protected. Remove the password and upload it again.');
    }
    throw new Error('This file could not be read. Save it again as .xlsx or .csv and retry.');
  }

  if (workbook.vbaraw) throw new Error('This workbook contains macros and cannot be imported.');

  const sheets = {};
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '', blankrows: false });
    sheets[name] = grid.map((row) => row.map((cell) => String(cell ?? '').trim()));
  }

  return { filename: file.name, fileHash, sheetNames: workbook.SheetNames, sheets };
}

/** Blocks spreadsheet-formula injection in anything handed back to the user. */
export function safeCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

const sheetFromRows = (rows) => XLSX.utils.aoa_to_sheet(rows.map((row) => row.map(safeCell)));

export function downloadWorkbook(filename, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(sheet.rows), sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, filename, { bookType: filename.endsWith('.csv') ? 'csv' : 'xlsx' });
}

/* ------------------------------- templates ------------------------------- */

export const NEW_PRODUCT_TEMPLATE_COLUMNS = [
  'Product Code', 'SKU Code', 'Product Name', 'Category', 'Design/Model', 'Size/Age', 'Colour/Variant',
  'Cost Price', 'Selling Price', 'Opening Stock', 'Reorder Level', 'Supplier', 'Rack', 'Shelf Location',
  'Product Description', 'Batch Number', 'Source Country', 'Wholesaler', 'Notes', 'Active',
];

export const STOCK_IN_TEMPLATE_COLUMNS = [
  'Stock In Date', 'SKU Code', 'Quantity Received', 'Unit Cost', 'Supplier', 'Purchase Reference', 'Rack',
  'Shelf Location', 'Received By', 'Batch Number', 'Source Country', 'Wholesaler', 'Notes',
];

const NEW_PRODUCT_INSTRUCTIONS = [
  ['Column', 'Required', 'How to fill it'],
  ['Product Code', 'No', 'Unique four-digit code such as 0001. Keep the leading zeros. Leave empty and the next free code is given automatically.'],
  ['SKU Code', 'Yes', 'Unique inventory code for this exact size/colour variant. Never reuse a code.'],
  ['Product Name', 'Yes', 'Customer facing product name. Rows with the same name and category become one product with sizes/colours.'],
  ['Category', 'Yes', 'For example Girls, Boys, Abaya, Accessories.'],
  ['Design/Model', 'No', 'Design or model reference.'],
  ['Size/Age', 'No', 'Leave empty only when the product genuinely has no sizes.'],
  ['Colour/Variant', 'No', 'Leave empty only when the product genuinely has no colours.'],
  ['Cost Price', 'Yes', 'Purchase cost in QAR. Numbers only, 0 or more.'],
  ['Selling Price', 'Yes', 'Retail price in QAR. Numbers only, 0 or more.'],
  ['Opening Stock', 'Yes', 'Units physically in hand now. Use 0 when the shipment has not arrived.'],
  ['Reorder Level', 'No', 'Low stock alert level. Defaults to 3.'],
  ['Supplier', 'No', 'Leave empty if unknown — it stays Not Assigned and can be set later.'],
  ['Rack', 'No', 'Storage rack.'],
  ['Shelf Location', 'No', 'Shelf or bin location.'],
  ['Product Description', 'No', 'Optional description.'],
  ['Batch Number', 'No', 'Optional batch of this opening-stock shipment, for example Batch 1.'],
  ['Source Country', 'No', 'Optional country the batch came from, for example UAE or CHN.'],
  ['Wholesaler', 'No', 'Optional wholesaler name. Existing suppliers are reused.'],
  ['Notes', 'No', 'Internal notes.'],
  ['Active', 'No', 'Yes or No. Defaults to Yes.'],
  ['', '', ''],
  ['Do not delete the heading row.', '', 'Delete the grey example row before importing.'],
];

const STOCK_IN_INSTRUCTIONS = [
  ['Column', 'Required', 'How to fill it'],
  ['Stock In Date', 'No', 'YYYY-MM-DD. Defaults to today when empty.'],
  ['SKU Code', 'Yes', 'Must already exist in FEMNIA. Create new products first.'],
  ['Quantity Received', 'Yes', 'Whole number greater than zero.'],
  ['Unit Cost', 'No', "Defaults to the SKU's existing cost price — shown in the preview."],
  ['Supplier', 'No', 'Optional. Never invent a supplier name.'],
  ['Purchase Reference', 'No', 'Invoice or purchase order reference.'],
  ['Rack', 'No', 'Storage rack.'],
  ['Shelf Location', 'No', 'Shelf or bin location.'],
  ['Received By', 'No', 'Person who received the shipment.'],
  ['Batch Number', 'No', 'Optional batch of this shipment, for example Batch 2. One SKU may have several batches.'],
  ['Source Country', 'No', 'Optional country the batch came from, for example UAE or CHN.'],
  ['Wholesaler', 'No', 'Optional wholesaler name. Existing suppliers are reused.'],
  ['Notes', 'No', 'Internal notes.'],
];

export function downloadNewProductsTemplate() {
  downloadWorkbook('FEMNIA_New_Products_Import_Template.xlsx', [
    {
      name: 'New Products',
      rows: [
        [...NEW_PRODUCT_TEMPLATE_COLUMNS],
        ['0001', 'EXAMPLE-001', 'Girls Abaya', 'Girls', 'A-120', '6-7Y', 'Black', 45, 89, 10, 3, '', 'R1', 'S2',
          'Soft crepe abaya', 'Batch 1', 'UAE', '', 'Example row — delete before importing', 'Yes'],
      ],
    },
    { name: 'Instructions', rows: NEW_PRODUCT_INSTRUCTIONS },
  ]);
}

export function downloadStockInTemplate() {
  downloadWorkbook('FEMNIA_Stock_In_Import_Template.xlsx', [
    {
      name: 'Stock In',
      rows: [
        [...STOCK_IN_TEMPLATE_COLUMNS],
        [today(), 'EXAMPLE-001', 10, 45, '', 'INV-1001', 'R1', 'S2', '', 'Batch 1', 'UAE', '',
          'Example row — delete before importing'],
      ],
    },
    { name: 'Instructions', rows: STOCK_IN_INSTRUCTIONS },
  ]);
}
