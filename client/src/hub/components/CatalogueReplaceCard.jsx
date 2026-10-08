/**
 * Admin-only "Replace Product Catalogue" — Settings → Backup.
 *
 * Guarded flow: fresh backup in this session → read-only preview → typed
 * confirmation → archive + audited stock reset → import the new workbook.
 * Nothing is deleted and every historical record is left untouched.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, Eye, Loader2, RotateCcw, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ImportWizard } from '@/hub/components/ImportWizard';
import { Button } from '@/hub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/hub/ui/card';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { cataloguePreviewQuery, qk, replaceCatalogue, rollbackCatalogueReplacement } from '@/hub/lib/api';
import { invalidateStock } from '@/hub/lib/invalidate';

const REPLACE_CONFIRM_PHRASE = 'REPLACE INVENTORY';

export function CatalogueReplaceCard({ backupFilename }) {
  const client = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [reason, setReason] = useState('');
  const [run, setRun] = useState(null);
  const [wizard, setWizard] = useState(false);

  const preview = useQuery({ ...cataloguePreviewQuery, enabled: showPreview });

  const refresh = () =>
    Promise.all([
      invalidateStock(client),
      client.invalidateQueries({ queryKey: qk.cataloguePreview }),
      client.invalidateQueries({ queryKey: ['femnia', 'product'] }),
    ]);

  const replace = useMutation({
    mutationFn: () => replaceCatalogue({ confirmPhrase: phrase, backupFilename: backupFilename ?? '', reason: reason.trim() }),
    onSuccess: async (result) => {
      setRun(result);
      setPhrase('');
      toast.success(`Catalogue archived — ${result.reference}. You can now import the new Products workbook.`);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const rollback = useMutation({
    mutationFn: () => rollbackCatalogueReplacement(run),
    onSuccess: async () => {
      toast.success('Rolled back — the previous catalogue and stock quantities are restored.');
      setRun(null);
      await refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const ready = Boolean(backupFilename);
  const phraseOk = phrase.trim().toUpperCase() === REPLACE_CONFIRM_PHRASE;

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" /> Replace Product Catalogue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Retires the whole current product list and lets you import a new Products workbook. Existing products are
          <strong> archived, never deleted</strong>, remaining stock is brought to zero through recorded stock
          adjustments, and all orders, invoices, customers, payments and history stay exactly as they are. A SKU code
          that already exists — including an archived one — is rejected by the import, so codes can never be duplicated.
        </p>

        <div className="rounded-xl border border-border p-3 text-sm">
          <p className="font-medium">Step 1 · Fresh backup</p>
          {ready ? (
            <p className="text-muted-foreground">Backup taken in this session: {backupFilename}</p>
          ) : (
            <p className="text-destructive">Use “Backup Data” above first. This step is required.</p>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
          <p className="font-medium">Step 2 · Preview</p>
          <Button variant="outline" className="h-11" disabled={!ready} onClick={() => setShowPreview(true)}>
            <Eye className="mr-2 size-4" /> Show what will change
          </Button>
          {showPreview && preview.isLoading && (
            <p className="text-muted-foreground">
              <Loader2 className="mr-2 inline size-4 animate-spin" /> Checking your catalogue…
            </p>
          )}
          {preview.error && <p className="text-destructive">{preview.error.message}</p>}
          {preview.data && (
            <>
              <ul className="grid gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-2">
                <li>Products to archive: {preview.data.totals.active}</li>
                <li>Already archived: {preview.data.totals.alreadyArchived}</li>
                <li>Units reset to zero: {preview.data.totals.unitsToZero}</li>
                <li>Used in past orders (kept): {preview.data.totals.linkedToOrders}</li>
              </ul>
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/60">
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Product</th>
                      <th className="p-2 text-right">Stock</th>
                      <th className="p-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.rows.map((row) => (
                      <tr key={row.key} className="border-t border-border">
                        <td className="p-2 font-mono">{row.sku}</td>
                        <td className="p-2">{row.name}</td>
                        <td className="p-2 text-right">{row.currentStock}</td>
                        <td className="p-2 text-muted-foreground">
                          {row.isActive ? 'Archive' : 'Already archived'}
                          {row.currentStock !== 0 ? ' · reset to 0' : ''}
                          {row.linkedToOrders ? ' · order history kept' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-destructive/40 p-3 text-sm">
          <p className="font-medium">Step 3 · Confirm</p>
          <div>
            <Label htmlFor="rpl-reason" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Reason (optional)
            </Label>
            <Input
              id="rpl-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="New season catalogue"
              className="h-11"
            />
          </div>
          <div>
            <Label htmlFor="rpl-phrase" className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              Type {REPLACE_CONFIRM_PHRASE} to continue
            </Label>
            <Input
              id="rpl-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={REPLACE_CONFIRM_PHRASE}
              className="h-11"
            />
          </div>
          <Button
            variant="destructive"
            className="h-11"
            disabled={!ready || !preview.data || !phraseOk || replace.isPending}
            onClick={() => replace.mutate()}
          >
            {replace.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Archive className="mr-2 size-4" />}
            Archive catalogue &amp; reset stock
          </Button>
        </div>

        {run && (
          <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
            <p className="font-medium">Step 4 · Import the new catalogue</p>
            <p className="text-muted-foreground">
              Reference {run.reference} — {run.archivedSkus.length} product(s) archived, {run.unitsRemoved} unit(s) reset
              to zero, {run.preservedLinkedToOrders} SKU(s) kept for past orders.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="h-11" onClick={() => setWizard(true)}>
                <Upload className="mr-2 size-4" /> Import Products workbook
              </Button>
              <Button variant="outline" className="h-11" disabled={rollback.isPending} onClick={() => rollback.mutate()}>
                {rollback.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RotateCcw className="mr-2 size-4" />}
                Undo this replacement
              </Button>
            </div>
          </div>
        )}

        {wizard && (
          <ImportWizard
            open
            kind="new_products"
            onClose={() => {
              setWizard(false);
              void refresh();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
