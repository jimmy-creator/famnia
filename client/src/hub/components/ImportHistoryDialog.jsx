import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState, ErrorState, LoadingRows } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { importBatchesQuery, reverseImport } from '@/hub/lib/api';
import { IMPORT_KIND_LABELS } from '@/hub/lib/imports';
import { downloadWorkbook } from '@/hub/lib/spreadsheet';
import { QAR } from '@/hub/lib/format';
import { invalidateStock } from '@/hub/lib/invalidate';

export function ImportHistoryDialog({ open, onClose, canReverse }) {
  const q = useQuery({ ...importBatchesQuery, enabled: open });
  const queryClient = useQueryClient();
  const [reversing, setReversing] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = q.data ?? [];

  const downloadReport = (batch) => {
    const failures = batch.report?.failures ?? [];
    downloadWorkbook(`FEMNIA_Import_${batch.id.slice(0, 8)}_report.xlsx`, [
      {
        name: 'Summary',
        rows: [
          ['Import Batch ID', batch.id],
          ['Import Type', IMPORT_KIND_LABELS[batch.batchType] ?? batch.batchType],
          ['Filename', batch.filename],
          ['Uploaded By', batch.createdByName ?? '—'],
          ['Date', new Date(batch.createdAt).toLocaleString()],
          ['Total Rows', batch.totalRows],
          ['Successful Rows', batch.successRows],
          ['Failed Rows', batch.failedRows],
          ['Units Added', batch.unitsAdded],
          ['Total Cost', batch.totalCost],
          ['Status', batch.status],
        ],
      },
      { name: 'Errors', rows: [['Row', 'SKU Code', 'Message'], ...failures.map((f) => [f.rowNumber, f.sku, f.message])] },
      { name: 'Products affected', rows: [['SKU Code'], ...batch.skus.map((sku) => [sku])] },
    ]);
  };

  const runReversal = async () => {
    if (!reversing) return;
    setBusy(true);
    try {
      const note = await reverseImport(reversing.id, reason);
      await invalidateStock(queryClient);
      toast.success(`Import reversed. ${note}`);
      setReversing(null);
      setReason('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import History</DialogTitle>
        </DialogHeader>

        {q.isPending ? (
          <LoadingRows count={4} />
        ) : q.isError ? (
          <ErrorState section="Import history" message={q.error.message} onRetry={() => q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="No imports yet" hint="Imports appear here with their batch ID and results." />
        ) : (
          <div className="space-y-3">
            {rows.map((batch) => (
              <div key={batch.id} className="rounded-2xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{batch.filename}</p>
                    <p className="font-mono text-xs text-muted-foreground">{batch.id}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">
                    {batch.status}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <Cell label="Type" value={IMPORT_KIND_LABELS[batch.batchType] ?? batch.batchType} />
                  <Cell label="Uploaded by" value={batch.createdByName ?? '—'} />
                  <Cell label="Date" value={new Date(batch.createdAt).toLocaleString()} />
                  <Cell label="Rows" value={`${batch.successRows}/${batch.totalRows}`} />
                  <Cell label="Failed" value={String(batch.failedRows)} />
                  <Cell label="Units added" value={String(batch.unitsAdded)} />
                  <Cell label="Total cost" value={QAR(batch.totalCost)} />
                  <Cell label="SKUs" value={String(batch.skus.length)} />
                </dl>
                {batch.reverseReason && (
                  <p className="mt-2 text-xs text-muted-foreground">Reversal reason: {batch.reverseReason}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-10" onClick={() => downloadReport(batch)}>
                    <Download className="mr-1 size-4" /> Reports
                  </Button>
                  {canReverse && !batch.reversedAt && batch.status !== 'Failed' && (
                    <Button variant="outline" size="sm" className="h-10 text-destructive" onClick={() => setReversing(batch)}>
                      <Undo2 className="mr-1 size-4" /> Reverse import
                    </Button>
                  )}
                </div>

                {reversing?.id === batch.id && (
                  <div className="mt-3 space-y-2 rounded-2xl bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground">
                      Confirmed ledger entries are never deleted. Stock In rows are reversed with correction entries and
                      imported products are deactivated — reversal is blocked when it would create negative stock.
                    </p>
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for reversal (required)"
                      className="h-11"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" className="h-10" onClick={() => setReversing(null)} disabled={busy}>
                        Cancel
                      </Button>
                      <Button className="h-10" onClick={() => runReversal()} disabled={busy || !reason.trim()}>
                        {busy ? 'Reversing…' : 'Confirm reversal'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Cell({ label, value }) {
  return (
    <div>
      <dt className="uppercase tracking-wide">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
