import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { FundingAccountHint } from '@/hub/components/FundingAccountHint';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { qk, recordReimbursement } from '@/hub/lib/api';
import {
  COMPANY_FUNDING_SOURCES,
  METHOD_DEFAULT_SOURCE,
  PAYMENT_METHODS,
  money,
  newIdempotencyKey,
} from '@/hub/lib/expenses';
import { today } from '@/hub/lib/format';

const selectClass =
  'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/** Remounts per liability (and its outstanding balance), so each open starts fresh. */
export function ReimbursementDialog(props) {
  const { liability } = props;
  return <ReimbursementForm key={liability ? `${liability.id}:${liability.outstanding}` : 'closed'} {...props} />;
}

function ReimbursementForm({ liability, onClose, onDone }) {
  const client = useQueryClient();
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(liability ? liability.outstanding.toFixed(2) : '');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  // The account follows the payment method until someone picks one explicitly.
  const [pickedSource, setPickedSource] = useState(null);
  const fundingSource = pickedSource ?? METHOD_DEFAULT_SOURCE[paymentMethod] ?? COMPANY_FUNDING_SOURCES[0];
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey('reimburse'));

  const value = Number(amount);
  const outstanding = liability?.outstanding ?? 0;
  const overpay = Number.isFinite(value) && value > outstanding + 0.001;
  const valid = Number.isFinite(value) && value > 0 && !overpay;

  const submit = useMutation({
    mutationFn: () => {
      if (!liability) throw new Error('Select a liability first.');
      return recordReimbursement({
        liabilityId: liability.id,
        paidOn,
        amount: value,
        paymentMethod,
        fundingSource,
        reference,
        notes,
        idempotencyKey,
      });
    },
    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: qk.liabilities });
      client.invalidateQueries({ queryKey: qk.fundingAccounts });
      client.invalidateQueries({ queryKey: qk.activity });
      onDone(result);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={Boolean(liability)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record reimbursement</DialogTitle>
        </DialogHeader>

        {liability && (
          <div className="rounded-xl bg-secondary/60 px-3 py-2 text-sm">
            <p className="font-medium text-foreground">{liability.person}</p>
            <p className="text-xs text-muted-foreground">
              {liability.entry?.item ?? '—'} · paid personally {money(liability.amount)} · reimbursed{' '}
              {money(liability.reimbursed)} · outstanding <strong>{money(liability.outstanding)}</strong>
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="rb-date">Reimbursement date</Label>
            <Input id="rb-date" type="date" className="h-11" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="rb-amount">Amount (QAR)</Label>
            <Input
              id="rb-amount"
              inputMode="decimal"
              className="h-11"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="rb-method">Payment method</Label>
            <select
              id="rb-method"
              className={selectClass}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rb-source">Paid from</Label>
            <select
              id="rb-source"
              className={selectClass}
              value={fundingSource}
              onChange={(e) => setPickedSource(e.target.value)}
            >
              {COMPANY_FUNDING_SOURCES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 -mt-3">
            <FundingAccountHint source={fundingSource} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="rb-reference">Reference (optional)</Label>
            <Input id="rb-reference" className="h-11" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="rb-notes">Notes (optional)</Label>
            <Textarea id="rb-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {overpay && (
          <p className="text-sm font-medium text-destructive">
            Amount cannot exceed the outstanding balance of {money(outstanding)}.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Settling a liability only records the repayment — it never creates another expense or asset.
        </p>

        <div className="sticky bottom-0 -mx-6 mt-2 flex flex-col gap-2 border-t border-border bg-background px-6 pt-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button className="h-11" onClick={() => submit.mutate()} disabled={!valid || submit.isPending}>
            {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save reimbursement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
