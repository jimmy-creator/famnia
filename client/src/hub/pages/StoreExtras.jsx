import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';

import { Loading, PageHeader } from '@/hub/components/shared';
import { accessQuery } from '@/hub/lib/api';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const Admin = lazy(() => import('@/pages/Admin'));

/** Online-store tools with no hub screen: abandoned carts, B2B quotes, reviews, coupons, theme. */
export default function StoreExtrasPage() {
  useHubTitle('Online Store — FEMNIA Hub');
  const access = useQuery(accessQuery).data ?? null;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Online Store"
        subtitle="Abandoned carts, B2B quotes, reviews, coupons and the storefront theme."
      />
      <Suspense fallback={<Loading />}>
        <Admin embedded legacy={access?.legacy ?? []} />
      </Suspense>
    </div>
  );
}
