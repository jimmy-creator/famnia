import { Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/hub/ui/alert-dialog';
import { cn } from '@/lib/utils';

/** Yes/no confirmation for an action that changes stock or can't be undone. */
export function ConfirmAction({ open, title, description, confirmLabel = 'Confirm', destructive, busy, onConfirm, onClose }) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent className="z-[80]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div className="space-y-2 text-sm">{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11" disabled={busy}>
            Back
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn('h-11', destructive && 'bg-destructive text-white hover:bg-destructive/90')}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
