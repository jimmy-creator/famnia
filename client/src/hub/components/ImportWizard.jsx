import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FileSpreadsheet, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { confirmImport, findBatchByHash, productsQuery } from '@/hub/lib/api';
import {
  IMPORT_KIND_LABELS,
  fieldsFor,
  isImportable,
  suggestMapping,
  totalsOf,
  validateImport,
} from '@/hub/lib/imports';
import { MAX_IMPORT_ROWS, downloadWorkbook, readImportFile } from '@/hub/lib/spreadsheet';
import { QAR } from '@/hub/lib/format';
import { invalidateStock } from '@/hub/lib/invalidate';
import { cn } from '@/lib/utils';

const STEP_LABELS = {
  upload: 'Upload file',
  sheet: 'Choose sheet',
  map: 'Map columns',
  preview: 'Validate & preview',
  result: 'Results',
};
const STEP_ORDER = ['upload', 'sheet', 'map', 'preview', 'result'];

export function ImportWizard({ open, onClose, kind }) {
  const queryClient = useQueryClient();
  const fields = fieldsFor(kind);

  const [step, setStep] = useState('upload');
  const [book, setBook] = useState(null);
  const [sheet, setSheet] = useState('');
  const [mapping, setMapping] = useState({});
  const [rows, setRows] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [removed, setRemoved] = useState([]);
  const [duplicateBatch, setDuplicateBatch] = useState(null);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [approveNew, setApproveNew] = useState(false);
  const [approveStockIn, setApproveStockIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => {
    setStep('upload');
    setBook(null);
    setSheet('');
    setMapping({});
    setRows([]);
    setOverrides({});
    setRemoved([]);
    setDuplicateBatch(null);
    setDuplicateAcknowledged(false);
    setApproveNew(false);
    setApproveStockIn(false);
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const grid = useMemo(() => (book && sheet ? (book.sheets[sheet] ?? []) : []), [book, sheet]);
  const headers = grid[0] ?? [];

  const pickFile = async (file) => {
    setBusy(true);
    try {
      const parsed = await readImportFile(file);
      const firstSheet = parsed.sheetNames.find((n) => !/instruction/i.test(n)) ?? parsed.sheetNames[0] ?? '';
      const body = (parsed.sheets[firstSheet] ?? []).length - 1;
      if (body > MAX_IMPORT_ROWS) {
        throw new Error(`This file has ${body} rows. The limit is ${MAX_IMPORT_ROWS} rows per import.`);
      }
      setBook(parsed);
      setSheet(firstSheet);
      const existing = await findBatchByHash(parsed.fileHash);
      setDuplicateBatch(existing);
      setDuplicateAcknowledged(false);
      setStep(parsed.sheetNames.length > 1 ? 'sheet' : 'map');
      setMapping(suggestMapping(parsed.sheets[firstSheet]?.[0] ?? [], fields));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const chooseSheet = (name) => {
    setSheet(name);
    setMapping(suggestMapping(book?.sheets[name]?.[0] ?? [], fields));
  };

  /** Validation reads live data only — it never writes or changes stock. */
  const runValidation = async (nextOverrides = overrides, nextRemoved = removed) => {
    setBusy(true);
    try {
      const patched = grid.map((cells, index) => {
        if (index === 0) return cells;
        const rowNumber = index + 1;
        const patch = nextOverrides[rowNumber];
        if (!patch) return cells;
        const copy = [...cells];
        for (const [key, value] of Object.entries(patch)) {
          const col = mapping[key];
          if (col !== null && col !== undefined) copy[col] = value;
        }
        return copy;
      });
      const products = await queryClient.fetchQuery({ ...productsQuery, staleTime: 0 });
      const validation = await validateImport(kind, patched, mapping, products);
      setRows(validation.rows.filter((row) => !nextRemoved.includes(row.rowNumber)));
      setStep('preview');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const totals = useMemo(() => totalsOf(rows), [rows]);
  const allValid = rows.length > 0 && totals.invalid === 0 && totals.duplicate === 0;

  const downloadErrors = () => {
    downloadWorkbook(`FEMNIA_${kind}_validation_report.xlsx`, [
      {
        name: 'Validation',
        rows: [
          ['Row', 'SKU Code', 'Product Name', 'Status', 'Classification', 'Messages'],
          ...rows.map((r) => [r.rowNumber, r.sku, r.name, r.status, r.classification, r.messages.join(' ')]),
        ],
      },
    ]);
  };

  const confirm = async () => {
    if (!book) return;
    setBusy(true);
    try {
      const outcome = await confirmImport(kind, {
        filename: book.filename,
        fileHash: book.fileHash,
        rows: rows.filter(isImportable),
        approveNewProducts: approveNew,
        approveStockIn,
      });
      setResult(outcome);
      setStep('result');
      await invalidateStock(queryClient);
      toast.success(`Import completed — batch ${outcome.batchId.slice(0, 8)}.`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="z-[70] max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Import {IMPORT_KIND_LABELS[kind]}
            {kind === 'stock_in' ? ' — Existing Products' : ''}
          </DialogTitle>
        </DialogHeader>

        <ol className="no-print mb-4 flex flex-wrap gap-2 text-xs">
          {STEP_ORDER.map((s, i) => (
            <li
              key={s}
              className={cn(
                'rounded-full px-2.5 py-1',
                step === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground',
              )}
            >
              {i + 1}. {STEP_LABELS[s]}
            </li>
          ))}
        </ol>

        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {kind === 'stock_in'
                ? 'Adds received units to SKUs that already exist. Unknown SKU codes are rejected — create those products first.'
                : 'Creates products and SKU variants. Quantity becomes Opening Stock, never a Stock In transaction.'}
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-8 text-center">
              <FileSpreadsheet className="size-8 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {busy ? 'Reading file…' : 'Choose an .xlsx or .csv file'}
              </span>
              <span className="text-xs text-muted-foreground">
                Maximum {MAX_IMPORT_ROWS} rows. Macros and password-protected files are rejected.
              </span>
              <input
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) pickFile(file);
                }}
              />
            </label>
          </div>
        )}

        {duplicateBatch && step !== 'upload' && step !== 'result' && (
          <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-4" /> This file appears to have already been imported.
            </p>
            <ul className="mt-2 space-y-0.5 text-xs">
              <li>Previous batch: {duplicateBatch.id}</li>
              <li>Imported: {new Date(duplicateBatch.createdAt).toLocaleString()}</li>
              <li>Imported by: {duplicateBatch.createdByName ?? '—'}</li>
              <li>
                Rows: {duplicateBatch.successRows}/{duplicateBatch.totalRows} · Units added: {duplicateBatch.unitsAdded}
              </li>
            </ul>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={duplicateAcknowledged}
                onChange={(e) => setDuplicateAcknowledged(e.target.checked)}
              />
              I have reviewed the previous import and still want to continue.
            </label>
          </div>
        )}

        {step === 'sheet' && book && (
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">Sheet to import</Label>
            <select
              value={sheet}
              onChange={(e) => chooseSheet(e.target.value)}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              {book.sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="h-11" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button className="h-11" onClick={() => setStep('map')}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review the suggested column mapping. Quantity columns are never guessed — confirm them yourself.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </Label>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Not mapped</option>
                    {headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                className="h-11"
                onClick={() => setStep(book && book.sheetNames.length > 1 ? 'sheet' : 'upload')}
              >
                Back
              </Button>
              <Button className="h-11" onClick={() => runValidation()} disabled={busy}>
                {busy ? 'Validating…' : 'Validate file'}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Total label="Total rows" value={String(totals.total)} />
              <Total label="Ready" value={String(totals.valid)} />
              <Total label="Warning" value={String(totals.warning)} />
              <Total label="Invalid" value={String(totals.invalid)} />
              <Total label="Duplicate" value={String(totals.duplicate)} />
              <Total label="Units" value={String(totals.units)} />
              <Total label="Cost value" value={QAR(totals.costValue)} />
            </div>
            {kind !== 'stock_in' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Total label="New products" value={String(totals.newProducts)} />
                <Total label="Stock In rows" value={String(totals.stockInRows)} />
                <Total label="Retail value" value={QAR(totals.retailValue)} />
              </div>
            )}

            <p className="rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              Nothing has changed yet — previewing never touches products, stock or the ledger.
            </p>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-border lg:block">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2">Row</th>
                    <th className="p-2">SKU</th>
                    <th className="p-2">Product</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Size</th>
                    <th className="p-2">Colour</th>
                    {kind !== 'new_products' && <th className="p-2 text-right">Prev stock</th>}
                    <th className="p-2 text-right">{kind === 'stock_in' ? 'Received' : 'Qty'}</th>
                    {kind !== 'new_products' && <th className="p-2 text-right">Resulting</th>}
                    <th className="p-2 text-right">Unit cost</th>
                    <th className="p-2 text-right">Total cost</th>
                    <th className="p-2">Supplier</th>
                    <th className="p-2">Batch</th>
                    <th className="p-2">Country</th>
                    <th className="p-2">Wholesaler</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Message</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.rowNumber} className={rowTint(row)}>
                      <td className="p-2">{row.rowNumber}</td>
                      <td className="p-2 font-mono text-xs">{row.sku || '—'}</td>
                      <td className="p-2">{row.name || '—'}</td>
                      <td className="p-2">{row.category ?? '—'}</td>
                      <td className="p-2">{row.size ?? '—'}</td>
                      <td className="p-2">{row.color ?? '—'}</td>
                      {kind !== 'new_products' && <td className="p-2 text-right">{row.previousStock ?? '—'}</td>}
                      <td className="p-2 text-right font-semibold">{row.quantity}</td>
                      {kind !== 'new_products' && <td className="p-2 text-right">{row.resultingStock ?? '—'}</td>}
                      <td className="p-2 text-right">
                        {QAR(row.costPrice)}
                        {row.unitCostDefaulted && <span className="ml-1 text-xs text-muted-foreground">(default)</span>}
                      </td>
                      <td className="p-2 text-right">{QAR(row.quantity * row.costPrice)}</td>
                      <td className="p-2">{row.supplier ?? 'Not Assigned'}</td>
                      <td className="p-2">{row.batchNumber ?? '—'}</td>
                      <td className="p-2">{row.sourceCountry ?? '—'}</td>
                      <td className="p-2">{row.wholesaler ?? '—'}</td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2 text-xs text-muted-foreground">{row.messages.join(' ')}</td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive"
                          onClick={() => {
                            setRemoved((prev) => [...prev, row.rowNumber]);
                            setRows((prev) => prev.filter((r) => r.rowNumber !== row.rowNumber));
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile validation cards */}
            <div className="space-y-2 lg:hidden">
              {rows.map((row) => (
                <div key={row.rowNumber} className={cn('rounded-2xl border border-border p-3', rowTint(row))}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{row.name || '—'}</p>
                      <p className="font-mono text-xs text-muted-foreground">{row.sku || '—'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-xs font-semibold">{row.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Row {row.rowNumber} · Qty {row.quantity}
                    {row.previousStock !== null && kind !== 'new_products'
                      ? ` · ${row.previousStock} → ${row.resultingStock}`
                      : ''}{' '}
                    · {QAR(row.costPrice)}
                  </p>
                  {(row.batchNumber || row.sourceCountry || row.wholesaler) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Batch: {[row.batchNumber, row.sourceCountry].filter(Boolean).join(' ') || '—'}
                      {row.wholesaler ? ` · ${row.wholesaler}` : ''}
                    </p>
                  )}
                  {row.messages.length > 0 && (
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary>Details</summary>
                      <ul className="mt-1 space-y-0.5">
                        {row.messages.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>

            {rows.some((r) => !isImportable(r)) && (
              <FixPanel
                rows={rows.filter((r) => !isImportable(r))}
                overrides={overrides}
                onChange={setOverrides}
                onRevalidate={() => runValidation()}
                busy={busy}
              />
            )}

            {kind === 'mixed' && (
              <div className="space-y-2 rounded-2xl border border-border p-3 text-sm">
                <p className="font-medium text-foreground">Admin approval required</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={approveNew} onChange={(e) => setApproveNew(e.target.checked)} />
                  Create {totals.newProducts} new SKU(s) with their quantity as Opening Stock
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={approveStockIn} onChange={(e) => setApproveStockIn(e.target.checked)} />
                  Add Stock In for {totals.stockInRows} existing SKU(s)
                </label>
              </div>
            )}

            <div className="sticky bottom-0 -mx-6 flex flex-col gap-2 border-t border-border bg-background px-6 py-3 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-11" onClick={() => setStep('map')}>
                Back to mapping
              </Button>
              <Button variant="outline" className="h-11" onClick={downloadErrors}>
                <Download className="mr-1 size-4" /> Error report
              </Button>
              <Button variant="outline" className="h-11" onClick={close}>
                Cancel import
              </Button>
              <Button
                className="h-11"
                onClick={() => confirm()}
                disabled={
                  busy ||
                  !allValid ||
                  (duplicateBatch !== null && !duplicateAcknowledged) ||
                  (kind === 'mixed' && !approveNew && !approveStockIn)
                }
              >
                {busy
                  ? 'Importing…'
                  : kind === 'stock_in'
                    ? 'Confirm Stock In Import'
                    : kind === 'mixed'
                      ? 'Confirm Mixed Import'
                      : 'Confirm New Products Import'}
              </Button>
            </div>
            {!allValid && (
              <p className="text-xs text-destructive">
                Every row must be valid before importing. Fix or remove the invalid and duplicate rows.
              </p>
            )}
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Total label="Import Batch ID" value={result.batchId.slice(0, 8)} />
              <Total label="Rows processed" value={String(result.rowsProcessed)} />
              <Total label="Products created" value={String(result.productsCreated)} />
              <Total label="Stock In rows" value={String(result.stockInRows)} />
              <Total label="Units added" value={String(result.unitsAdded)} />
              <Total label="Total cost" value={QAR(result.totalCost)} />
              <Total label="Failed rows" value={String(result.failedRows)} />
              <Total label="SKUs affected" value={String(result.skus.length)} />
            </div>
            <p className="break-all rounded-2xl bg-secondary/50 p-3 text-xs text-muted-foreground">
              Batch {result.batchId} — recorded in Import History with an audit entry.
            </p>
            {result.failures.length > 0 && (
              <ul className="space-y-1 text-xs text-destructive">
                {result.failures.map((f) => (
                  <li key={`${f.rowNumber}-${f.sku}`}>
                    Row {f.rowNumber} ({f.sku}): {f.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button className="h-11" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function rowTint(row) {
  if (row.status === 'Invalid') return 'bg-destructive/5';
  if (row.status === 'Duplicate') return 'bg-amber-50';
  if (row.status === 'Warning') return 'bg-amber-50/50';
  return '';
}

function Total({ label, value }) {
  return (
    <div className="rounded-2xl bg-secondary/50 p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

const FIXABLE = [
  { key: 'sku', label: 'SKU Code' },
  { key: 'name', label: 'Product Name' },
  { key: 'category', label: 'Category' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'costPrice', label: 'Cost' },
  { key: 'sellingPrice', label: 'Selling' },
];

function FixPanel({ rows, overrides, onChange, onRevalidate, busy }) {
  const initial = (row, key) =>
    String(
      key === 'quantity'
        ? row.quantity
        : key === 'costPrice'
          ? row.costPrice
          : key === 'sellingPrice'
            ? row.sellingPrice
            : key === 'sku'
              ? row.sku
              : key === 'name'
                ? row.name
                : (row.category ?? ''),
    );
  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-medium text-foreground">Correct values before importing</p>
      {rows.map((row) => (
        <div key={row.rowNumber} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {FIXABLE.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Row {row.rowNumber} · {field.label}
              </Label>
              <Input
                className="h-10"
                defaultValue={overrides[row.rowNumber]?.[field.key] ?? initial(row, field.key)}
                onChange={(e) =>
                  onChange({
                    ...overrides,
                    [row.rowNumber]: { ...(overrides[row.rowNumber] ?? {}), [field.key]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      ))}
      <Button variant="outline" className="h-11" onClick={onRevalidate} disabled={busy}>
        Re-validate corrected rows
      </Button>
    </div>
  );
}
