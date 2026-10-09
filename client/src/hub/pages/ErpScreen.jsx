import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { Loading, PageHeader } from '@/hub/components/shared';
import { accessQuery } from '@/hub/lib/api';
import { ERP_SCREENS, canOpenScreen } from '@/hub/lib/erpScreens';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const Erp = lazy(() => import('@/pages/Erp'));

/** One of our ERP screens as a hub page (/hub/m/:screen). */
export default function ErpScreenPage() {
  const { screen } = useParams();
  const meta = ERP_SCREENS[screen];
  const access = useQuery(accessQuery).data ?? null;
  useHubTitle(`${meta?.title ?? 'Back Office'} — FEMNIA Hub`);
  if (!meta) return <Navigate to="/hub/dashboard" replace />;
  return (
    <div className="space-y-4">
      <PageHeader title={meta.title} subtitle={meta.subtitle} />
      {access && !canOpenScreen(access, screen) ? (
        <p className="text-sm text-muted-foreground">You do not have permission to open this screen.</p>
      ) : (
        <Suspense fallback={<Loading />}>
          {/* keyed so moving between screens starts each one fresh */}
          <Erp key={screen} embedded screen={meta.tab} legacy={access?.legacy ?? []} />
        </Suspense>
      )}
    </div>
  );
}
