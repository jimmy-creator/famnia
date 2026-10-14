/**
 * Admin-only "Import Data" — Settings → Backup.
 *
 * Imports a workbook in the FEMNIA Hub backup layout (the old system's backup,
 * or the template below filled in): products and stock history, customers,
 * orders, returns, expenses, assets, liabilities and audit logs. Preview runs
 * the whole import and rolls it back; Import is offered only after a preview
 * of the same file came back without errors.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Download, Eye, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import api from '@/api/axios';
import { qk } from '@/hub/lib/api';
import { Button } from '@/hub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/hub/ui/card';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';

const where = (m) => `${m.sheet}${m.row ? ` · row ${m.row}` : ''}`;

export function DataImportCard() {
  const client = useQueryClient();
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(null);   // 'preview' | 'import'

  const run = async (commit) => {
    const body = new FormData();
    body.append('file', file);
    setBusy(commit ? 'import' : 'preview');
    try {
      const { data } = await api.post(`/hub/data-import${commit ? '?commit=1' : ''}`, body, { timeout: 0 });
      setReport(data);
      if (data.committed) {
        toast.success('Data imported.');
        // Not the settings: reloading them remounts the Settings form, which would wipe this report.
        await client.invalidateQueries({
          queryKey: qk.all,
          predicate: (q) => q.queryKey[1] !== qk.appSettings[1],
        });
      } else if (data.errorCount) {
        toast.error(`${data.errorCount} row(s) need fixing — nothing was saved.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'The import failed. Nothing was saved.', { duration: 10000 });
    } finally {
      setBusy(null);
    }
  };

  const pick = (e) => {
    setFile(e.target.files?.[0] || null);
    setReport(null);
  };

  const canImport = report && report.dryRun && !report.errorCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Brings in products with their stock history, customers, sales orders, returns, payments, expenses, assets,
          liabilities and audit logs from an Excel file. A backup from the old FEMNIA Hub can be imported as it is; for
          anything else, download the template and fill in the sheets you need. Records that already exist are skipped,
          so importing the same file twice never doubles anything — except orders, which a newer backup brings up to
          date (status, payment, lines, stock) unless they have been changed in this hub since.
        </p>
        <Button asChild variant="outline" className="h-11">
          <a href={`${api.defaults.baseURL}/hub/data-import/template`}>
            <Download className="mr-2 size-4" /> Download template
          </a>
        </Button>

        <div>
          <Label htmlFor="hub-data-import-file" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
            Workbook (.xlsx)
          </Label>
          <Input id="hub-data-import-file" type="file" accept=".xlsx" onChange={pick} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button className="h-11" disabled={!file || Boolean(busy)} onClick={() => run(false)}>
            {busy === 'preview' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Eye className="mr-2 size-4" />}
            {busy === 'preview' ? 'Checking…' : 'Preview'}
          </Button>
          {canImport && (
            <Button className="h-11" disabled={Boolean(busy)} onClick={() => run(true)}>
              {busy === 'import' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              {busy === 'import' ? 'Importing…' : 'Import now'}
            </Button>
          )}
        </div>

        {report && <ImportReport report={report} />}
      </CardContent>
    </Card>
  );
}

function ImportReport({ report }) {
  const heading = report.committed
    ? 'Imported'
    : report.errorCount
      ? `${report.errorCount} error(s) — nothing was saved`
      : 'Preview — nothing saved yet. Check the figures, then Import now.';
  return (
    <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
      <p className={report.errorCount ? 'font-medium text-destructive' : 'font-medium'}>{heading}</p>

      <ul className="grid gap-x-6 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
        {Object.entries(report.counts).map(([sheet, counts]) => (
          <li key={sheet}>
            <span className="text-foreground">{sheet}:</span>{' '}
            {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}
          </li>
        ))}
      </ul>

      {report.cashDebited.length > 0 && (
        <div>
          <p className="font-medium">Paid from cash accounts</p>
          <p className="text-muted-foreground">
            Historical expenses and reimbursements are taken out of these accounts. Set each account&apos;s opening
            balance (Cash &amp; Bank) so its balance matches what it really holds.
          </p>
          <ul className="mt-1 text-muted-foreground">
            {report.cashDebited.map((c) => (
              <li key={c.account}>
                {c.account}: QAR {c.amount.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.unmatchedStaff.length > 0 && (
        <p className="text-muted-foreground">
          No hub account named {report.unmatchedStaff.join(', ')} — their records are kept under your name. Add those
          staff (same name) before importing to keep them linked.
        </p>
      )}
      {report.examplesSkipped > 0 && <p className="text-muted-foreground">{report.examplesSkipped} EXAMPLE- row(s) skipped.</p>}

      {report.errors.length > 0 && (
        <MessageList title={`Errors (${report.errorCount})`} items={report.errors} className="text-destructive" open />
      )}
      {report.warnings.length > 0 && <MessageList title={`Warnings (${report.warningCount})`} items={report.warnings} />}
    </div>
  );
}

function MessageList({ title, items, className = 'text-muted-foreground', open = false }) {
  return (
    <details open={open}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ul className={`mt-1 max-h-64 space-y-0.5 overflow-auto ${className}`}>
        {items.map((m, i) => (
          <li key={i}>
            <span className="font-mono text-xs">[{where(m)}]</span> {m.message}
          </li>
        ))}
      </ul>
    </details>
  );
}
