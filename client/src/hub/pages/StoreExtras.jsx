import { lazy, Suspense } from 'react';

import { Loading, PageHeader } from '@/hub/components/shared';
import { useHubTitle } from '@/hub/lib/useHubTitle';

const Admin = lazy(() => import('@/pages/Admin'));

/** Online-store tools with no hub screen: categories, abandoned carts, B2B quotes, reviews, coupons, theme. */
export default function StoreExtrasPage() {
  useHubTitle('Online Store — FEMNIA Hub');
  return (
    <div className="space-y-4">
      <PageHeader
        title="Online Store"
        subtitle="Categories, abandoned carts, B2B quotes, reviews, coupons and the storefront theme."
      />
      <Suspense fallback={<Loading />}>
        <Admin embedded />
      </Suspense>
    </div>
  );
}
