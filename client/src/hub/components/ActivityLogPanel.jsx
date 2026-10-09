import { useQuery } from '@tanstack/react-query';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { EmptyState, ErrorState, LoadingRows } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Checkbox } from '@/hub/ui/checkbox';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { activityLogQuery, activityOptionsQuery } from '@/hub/lib/apiAdmin';
import { cn } from '@/lib/utils';

const ALL = '';
const dt = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const EMPTY = { from: '', to: '', action: ALL, module: ALL, overrides: false };

/**
 * Every action recorded by the hub, the till and the classic admin (they share
 * one log): date range, action, module and manager-override filters, with each
 * row expandable to its location, approving manager, reason, IP and details.
 */
export function ActivityLogPanel() {
  const [filters, setFilters] = useState(EMPTY);
  const [open, setOpen] = useState(null);
  const log = useQuery(activityLogQuery(filters));
  const options = useQuery(activityOptionsQuery).data ?? { actions: [], modules: [] };
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-3">
      <div className="card-surface grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">From</Label>
          <Input type="date" className="h-11" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">To</Label>
          <Input type="date" className="h-11" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Action</Label>
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={filters.action}
            onChange={(e) => set({ action: e.target.value })}
            aria-label="Filter by action"
          >
            <option value={ALL}>All actions</option>
            {options.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Module</Label>
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={filters.module}
            onChange={(e) => set({ module: e.target.value })}
            aria-label="Filter by module"
          >
            <option value={ALL}>All modules</option>
            {options.modules.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-11 items-center gap-2 text-sm text-foreground">
          <Checkbox checked={filters.overrides} onCheckedChange={(v) => set({ overrides: Boolean(v) })} />
          Manager overrides only
        </label>
        <Button variant="outline" className="h-11" onClick={() => setFilters(EMPTY)}>
          <RotateCcw className="mr-2 size-4" /> Clear
        </Button>
      </div>

      {log.isPending ? (
        <LoadingRows count={6} />
      ) : log.isError ? (
        <ErrorState section="Activity log" message={log.error.message} onRetry={() => void log.refetch()} />
      ) : !log.data?.length ? (
        <EmptyState title="No activity matches these filters" />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {log.data.length} entr{log.data.length === 1 ? 'y' : 'ies'}
            {log.data.length >= 500 ? ' (latest 500 — narrow the dates to see older ones)' : ''}
          </p>
          <ul className="divide-y divide-border card-surface">
            {log.data.map((entry) => {
              const expanded = open === entry.id;
              return (
                <li key={entry.id} className={cn('text-sm', entry.approvedBy && 'bg-amber-50/60')}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 p-3 text-left"
                    onClick={() => setOpen(expanded ? null : entry.id)}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0">
                      <p className="text-foreground">
                        <span className="font-medium">{entry.staffName ?? 'Unknown staff'}</span> · {entry.action}
                        {entry.module ? ` · ${entry.module}` : ''}
                        {entry.approvedBy ? <span className="ml-1 font-medium text-amber-700"> · override by {entry.approvedBy}</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {dt(entry.createdAt)}
                        {entry.recordId ? ` · ${entry.recordId}` : ''}
                        {entry.description ? ` · ${entry.description}` : ''}
                      </p>
                    </div>
                    <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded && (
                    <div className="space-y-1 border-t border-border bg-secondary/30 px-3 py-3 text-xs text-muted-foreground">
                      {entry.staffRole && <p>Role: <span className="text-foreground">{entry.staffRole}</span></p>}
                      <p>Location: <span className="text-foreground">{entry.location ?? '—'}</span></p>
                      <p>Approving manager: <span className="text-foreground">{entry.approvedBy ?? '—'}</span></p>
                      <p>Reason: <span className="text-foreground">{entry.reason ?? '—'}</span></p>
                      <p>IP: <span className="text-foreground">{entry.ip ?? '—'}</span></p>
                      {entry.details != null && (
                        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-background p-2 text-[11px] text-foreground">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
