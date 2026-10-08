import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { productHistoryQuery } from '@/hub/lib/api';

const dt = (value) => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function ProductHistoryDialog({ product, open, onClose }) {
  const history = useQuery({ ...productHistoryQuery(product?.key ?? ''), enabled: open && Boolean(product?.key) });

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] w-full max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">History · {product.sku}</DialogTitle>
        </DialogHeader>

        {history.isPending ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading history…
          </div>
        ) : history.error ? (
          <p className="py-8 text-sm text-destructive">{history.error.message}</p>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Stock movements</h3>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Reference</th>
                      <th className="px-3 py-2 text-right">Change</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2">Staff</th>
                      <th className="px-3 py-2">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history.data?.movements ?? []).map((row) => (
                      <tr key={`${row.id}-${row.date}`} className="border-t border-border">
                        <td className="whitespace-nowrap px-3 py-2">{String(row.date).slice(0, 10)}</td>
                        <td className="px-3 py-2">{row.type}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.reference}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${row.quantityChange < 0 ? 'text-destructive' : 'text-foreground'}`}
                        >
                          {row.quantityChange > 0 ? '+' : ''}
                          {row.quantityChange}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{row.quantityAfter}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.by ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.reason ?? row.notes ?? '—'}</td>
                      </tr>
                    ))}
                    {!history.data?.movements.length && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                          No stock movements yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Product changes</h3>
              <ul className="space-y-2">
                {(history.data?.fieldChanges ?? []).map((row) => (
                  <li key={row.id} className="rounded-2xl border border-border p-3 text-sm">
                    <p className="text-foreground">
                      <span className="font-medium">{row.field}</span>: {row.oldValue ?? '—'} → {row.newValue ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dt(row.createdAt)} · {row.changedByName ?? 'Unknown staff'}
                    </p>
                  </li>
                ))}
                {!history.data?.fieldChanges.length && (
                  <li className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No product detail changes recorded.
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
