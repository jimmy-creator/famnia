import { lazy, Suspense } from 'react';

import { Loading, PageHeader } from '@/hub/components/shared';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const Erp = lazy(() => import('@/pages/Erp'));

/**
 * Our ERP features the client's design has no screen for — purchasing,
 * cash accounts, P&L, balance sheet, stock counts, transfers, wastage, POS
 * shifts, audit, database backup — shown inside the hub shell with the
 * hub's palette (`.hub-legacy` in hub.css).
 */
export default function BackOfficePage() {
  useHubTitle('Back Office — FEMNIA Hub');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Back Office"
        subtitle="Purchasing, cash & finance, stock control, POS shifts and audit — the ERP tools that sit behind the hub."
      />
      <Suspense fallback={<Loading />}>
        <Erp embedded />
      </Suspense>
    </div>
  );
}
