import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FundingAccountHint } from '@/hub/components/FundingAccountHint';
import { Button } from '@/hub/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/hub/ui/dialog';
import { Input } from '@/hub/ui/input';
import { Label } from '@/hub/ui/label';
import { Textarea } from '@/hub/ui/textarea';
import { accessQuery, assetsQuery, expensesQuery, qk, saveEntry } from '@/hub/lib/api';
import {
  ASSET_CATEGORIES,
  COMPANY_FUNDING_SOURCES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PERSONAL_FUNDING_SOURCE,
  knownPeople,
  money,
  newEntryReference,
  newIdempotencyKey,
} from '@/hub/lib/expenses';
import { today } from '@/hub/lib/format';

const selectClass =
  'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

/** Remounts the form each time it opens, so every open starts from fresh defaults. */
export function ExpenseEntryDialog(props) {
  return <ExpenseEntryForm key={props.open ? `open:${props.kind}` : 'closed'} {...props} />;
}

function ExpenseEntryForm({ open, kind, onClose, onDone }) {
  const client = useQueryClient();
  const access = useQuery(accessQuery).data ?? null;
  const knownExpenses = useQuery(expensesQuery).data;
  const knownAssets = useQuery(assetsQuery).data;
  const me = (access?.fullName ?? access?.email ?? '').trim();
  const people = useMemo(() => {
    const list = knownPeople([...(knownExpenses ?? []), ...(knownAssets ?? [])]);
    return me && !list.includes(me) ? [me, ...list] : list;
  }, [knownExpenses, knownAssets, me]);
  const label = kind === 'expense' ? 'Expense' : 'Asset';
  const categories = kind === 'expense' ? EXPENSE_CATEGORIES : ASSET_CATEGORIES;

  const [reference] = useState(() => newEntryReference(kind));
  const [idempotencyKey] = useState(() => newIdempotencyKey(kind));
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState(categories[0]);
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState('');
  const [purchasedBy, setPurchasedBy] = useState(me);
  const [purchasePerson, setPurchasePerson] = useState(me);
  const [payee, setPayee] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paidBy, setPaidBy] = useState('company');
  const [companySource, setCompanySource] = useState(COMPANY_FUNDING_SOURCES[0]);
  const [receiptReference, setReceiptReference] = useState('');
  const [notes, setNotes] = useState('');

  const value = Number(amount);
  const personal = paidBy === 'personal';
  const fundingSource = personal ? PERSONAL_FUNDING_SOURCE : companySource;
  const valid =
    Boolean(item.trim()) &&
    Boolean(purchasedBy.trim()) &&
    Number.isFinite(value) &&
    value > 0 &&
    (personal ? Boolean(purchasePerson.trim()) : Boolean(companySource));

  const submit = useMutation({
    mutationFn: () =>
      saveEntry({
        entryType: kind,
        reference,
        date,
        category,
        item,
        amount: value,
        purchasedBy,
        purchasePerson,
        payee,
        paymentMethod,
        fundingSource,
        receiptReference,
        notes,
        idempotencyKey,
      }),

    onSuccess: (result) => {
      client.invalidateQueries({ queryKey: qk.expenses });
      client.invalidateQueries({ queryKey: qk.assets });
      client.invalidateQueries({ queryKey: qk.liabilities });
      client.invalidateQueries({ queryKey: qk.fundingAccounts });
      client.invalidateQueries({ queryKey: qk.activity });
      onDone(result);
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{kind === 'expense' ? 'Add Daily Expense' : 'Add Purchased Asset'}</DialogTitle>
        </DialogHeader>

        <p className="rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          Reference {reference || '…'} · Product stock purchases belong in Stock In, not here.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="entry-date">Date</Label>
            <Input id="entry-date" type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="entry-category">{kind === 'expense' ? 'Expense category' : 'Asset category'}</Label>
            <select
              id="entry-category"
              className={selectClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="entry-item">{kind === 'expense' ? 'Expense details / item' : 'Asset item'}</Label>
            <Input
              id="entry-item"
              className="h-11"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder={kind === 'expense' ? 'e.g. Packing bags' : 'e.g. Display rack'}
            />
          </div>
          <div>
            <Label htmlFor="entry-amount">Amount (QAR)</Label>
            <Input
              id="entry-amount"
              inputMode="decimal"
              className="h-11"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="entry-purchased-by">Purchased by / expense made by</Label>
            <Input
              id="entry-purchased-by"
              className="h-11"
              list="entry-people"
              value={purchasedBy}
              onChange={(e) => setPurchasedBy(e.target.value)}
              placeholder="Select or type a name"
            />
            <datalist id="entry-people">
              {people.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <Label htmlFor="entry-person">Liability person{personal ? '' : ' (optional)'}</Label>
            <Input
              id="entry-person"
              className="h-11"
              list="entry-people"
              value={purchasePerson}
              onChange={(e) => setPurchasePerson(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="entry-payee">Supplier / payee (optional)</Label>
            <Input id="entry-payee" className="h-11" value={payee} onChange={(e) => setPayee(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="entry-method">Payment method</Label>
            <select
              id="entry-method"
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
          <div className="sm:col-span-2">
            <Label>Who paid?</Label>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {[
                ['company', 'Paid by Company'],
                ['personal', 'Personally Paid / Reimbursement Pending'],
              ].map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPaidBy(key)}
                  className={
                    'rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors ' +
                    (paidBy === key
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-foreground/80 hover:bg-secondary')
                  }
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
          {!personal && (
            <div className="sm:col-span-2">
              <Label htmlFor="entry-funding">Company payment source</Label>
              <select
                id="entry-funding"
                className={selectClass}
                value={companySource}
                onChange={(e) => setCompanySource(e.target.value)}
              >
                {COMPANY_FUNDING_SOURCES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <FundingAccountHint source={companySource} />
            </div>
          )}
          <div>
            <Label htmlFor="entry-receipt">Reference / receipt no. (optional)</Label>
            <Input
              id="entry-receipt"
              className="h-11"
              value={receiptReference}
              onChange={(e) => setReceiptReference(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="entry-notes">Notes (optional)</Label>
            <Textarea id="entry-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        {personal && (
          <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
            A pending liability of {Number.isFinite(value) && value > 0 ? money(value) : 'the entered amount'} will be
            opened for <strong>{purchasePerson.trim() || 'the purchase person'}</strong>.
          </p>
        )}

        <div className="sticky bottom-0 -mx-6 mt-2 flex flex-col gap-2 border-t border-border bg-background px-6 pt-3 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-11" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button className="h-11" onClick={() => submit.mutate()} disabled={!valid || submit.isPending}>
            {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save {label}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
