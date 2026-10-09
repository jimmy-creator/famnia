import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';

import { Loading, PageHeader } from '@/hub/components/shared';
import { accessQuery } from '@/hub/lib/api';
import { STORE_SCREENS, canOpenStoreScreen } from '@/hub/lib/erpScreens';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const Admin = lazy(() => import('@/pages/Admin'));

/** One online-store screen as a hub page (/hub/s/:screen). */
export default function StoreScreenPage() {
  const { screen } = useParams();
  const meta = STORE_SCREENS[screen];
  const access = useQuery(accessQuery).data ?? null;
  useHubTitle(`${meta?.title ?? 'Online Store'} — FEMNIA Hub`);
  if (!meta) return <Navigate to="/hub/dashboard" replace />;
  return (
    <div className="space-y-4">
      <PageHeader title={meta.title} subtitle={meta.subtitle} />
      {access && !canOpenStoreScreen(access, screen) ? (
        <p className="text-sm text-muted-foreground">You do not have permission to open this screen.</p>
      ) : (
        <Suspense fallback={<Loading />}>
          <Admin key={screen} embedded screen={meta.tab} legacy={access?.legacy ?? []} />
        </Suspense>
      )}
    </div>
  );
}
