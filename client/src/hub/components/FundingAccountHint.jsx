import { useQuery } from '@tanstack/react-query';

import { fundingAccountsQuery } from '@/hub/lib/api';

/** One muted line naming the cash account a company funding source pays from, and its balance. */
export function FundingAccountHint({ source }) {
  const accounts = useQuery(fundingAccountsQuery);
  const row = accounts.data?.sources?.find((s) => s.source === source) ?? null;
  if (!accounts.data) return null;
  const name = row?.cashAccountName ?? `new account “${source}”`;
  const balance = row?.balance;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Paid from cash account: {name}
      {balance !== null && balance !== undefined ? ` · balance QAR ${Number(balance).toFixed(2)}` : ''}
    </p>
  );
}
