/**
 * Select an existing customer (search by name or mobile) and autofill a form.
 * Read-only: it never creates or edits customer records.
 */
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState, ErrorState, LoadingRows } from '@/hub/components/shared';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { customerRecordsQuery } from '@/hub/lib/api';
import { filterCustomers } from '@/hub/lib/customers';

export function CustomerPicker({ open, onClose, onSelect }) {
  const customers = useQuery({ ...customerRecordsQuery, enabled: open });
  const [query, setQuery] = useState('');
  const results = useMemo(() => filterCustomers(customers.data ?? [], query).slice(0, 40), [customers.data, query]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select existing customer</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or mobile number"
            className="h-11 pl-9"
          />
        </div>
        <div className="mt-2 space-y-2">
          {customers.isLoading && <LoadingRows count={4} />}
          {customers.isError && (
            <ErrorState
              section="customers"
              message={customers.error instanceof Error ? customers.error.message : 'Unknown error'}
              onRetry={() => void customers.refetch()}
            />
          )}
          {customers.isSuccess && !results.length && <EmptyState title="No customer matched" hint="Try another name or number." />}
          {results.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              className="h-auto w-full justify-start whitespace-normal px-3 py-3 text-left"
              onClick={() => {
                onSelect(c);
                onClose();
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.phone}
                  {c.altPhone ? ` · ${c.altPhone}` : ''} · {c.area ?? 'No area'} · {c.code ?? c.id}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
