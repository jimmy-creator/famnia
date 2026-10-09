import { useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { classicCsvExportUrl, classicCsvTemplateUrl, importClassicCsv } from '@/hub/lib/apiProducts';
import { invalidateStock } from '@/hub/lib/invalidate';

/**
 * The classic catalogue CSV (export, import, three templates) — the store
 * admin's bulk tool, kept next to the hub's Excel import wizard.
 */
export function ClassicCsvMenu({ onImported }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef(null);

  const upload = async (picked) => {
    if (!picked) return;
    setBusy(true);
    try {
      const result = await importClassicCsv(picked);
      toast.success(result.message || 'Import finished');
      (result.errors ?? []).slice(0, 8).forEach((e) => toast.error(e));
      await invalidateStock(client);
      onImported?.();
      setOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const link = (href, label, hint) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-start gap-3 rounded-xl border border-border p-3 hover:bg-secondary"
    >
      <Download className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </a>
  );

  return (
    <>
      <Button size="sm" variant="outline" className="h-10" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-2 size-4" /> Catalogue CSV
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Catalogue CSV</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The store catalogue’s CSV tools: storefront fields, variants, Arabic and per-location stock in one sheet. For
            new products with opening batches, the Excel <span className="font-medium">Import New Products</span> wizard is
            usually easier.
          </p>
          <div className="space-y-2">
            {link(classicCsvExportUrl, 'Export catalogue (CSV)', 'Every product with its storefront fields and variants.')}
            {link(classicCsvTemplateUrl(), 'Template — stock sheet', 'SKU, colour breakdown, cost / selling price, reorder level.')}
            {link(classicCsvTemplateUrl('full'), 'Template — full', 'Variants, Arabic and per-location stock.')}
            {link(classicCsvTemplateUrl('simple'), 'Template — simple', 'One row per product, no variants or Arabic.')}
            <input
              ref={file}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button className="h-11 w-full" disabled={busy} onClick={() => file.current?.click()}>
              {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              Import CSV
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
