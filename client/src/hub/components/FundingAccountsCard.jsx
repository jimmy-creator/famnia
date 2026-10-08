import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/hub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/hub/ui/card';
import { Label } from '@/hub/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/hub/ui/select';
import { fundingAccountsQuery, qk, saveFundingAccounts } from '@/hub/lib/api';
import { QAR } from '@/hub/lib/format';

const AUTO = 'auto';

/**
 * Which cash account each company funding source pays from. Expenses,
 * assets and reimbursements debit that account (and are refused when it
 * can't cover them). Unmapped sources use the account with the same name,
 * created on first use.
 */
export function FundingAccountsCard() {
  const q = useQuery(fundingAccountsQuery);
  if (!q.data) return null;
  return <FundingAccountsForm key={q.dataUpdatedAt} data={q.data} />;
}

function FundingAccountsForm({ data }) {
  const client = useQueryClient();
  const [mapping, setMapping] = useState(() =>
    Object.fromEntries(data.sources.map((s) => [s.source, s.mapped ? String(s.cashAccountId) : AUTO])),
  );
  const save = useMutation({
    mutationFn: () =>
      saveFundingAccounts(Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== AUTO).map(([k, v]) => [k, Number(v)]))),
    onSuccess: async (r) => {
      toast.success(r.changed ? 'Funding accounts saved.' : 'No changes to save.');
      await client.invalidateQueries({ queryKey: qk.fundingAccounts });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funding accounts</CardTitle>
        <p className="text-sm text-muted-foreground">
          The cash account each funding source pays from. Company-paid expenses, assets and reimbursements reduce that
          account, and are refused when it doesn’t hold enough. “Same name” uses (or creates) an account named after
          the source.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {data.sources.map((s) => (
          <div key={s.source}>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{s.source}</Label>
            <Select value={mapping[s.source]} onValueChange={(v) => setMapping((m) => ({ ...m, [s.source]: v }))}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO}>Same name ({s.source})</SelectItem>
                {data.accounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {s.cashAccountName ? `Now: ${s.cashAccountName} · balance ${QAR(s.balance ?? 0)}` : 'Account created on first use'}
            </p>
          </div>
        ))}
        <div className="sm:col-span-2">
          <Button className="h-11" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-2 size-4" /> Save funding accounts
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
