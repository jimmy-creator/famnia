/**
 * Stand-alone delivery label page (/hub/print/delivery-label/:orderId),
 * rendered outside the AppShell so only the label prints.
 * ?size=100x150|100x130 overrides the settings size; ?autoprint=1 opens the
 * print dialog once the order and fonts have loaded.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

import { DeliveryLabel } from '@/hub/components/DeliveryLabel';
import { accessQuery, appSettingsQuery, salesOrderQuery } from '@/hub/lib/api';
import { useHubTitle } from '@/hub/lib/useHubTitle';

function usePageSize(size) {
  useEffect(() => {
    const id = 'femnia-label-page-rule';
    document.getElementById(id)?.remove();
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `@page { size: ${size === '100x150' ? '100mm 150mm' : '100mm 130mm'}; margin: 0; }`;
    document.head.appendChild(style);
    const html = document.documentElement;
    html.classList.add('dl-print');
    html.classList.toggle('dl-print-150', size === '100x150');
    return () => {
      style.remove();
      html.classList.remove('dl-print', 'dl-print-150');
    };
  }, [size]);
}

export default function PrintDeliveryLabelPage() {
  useHubTitle('Delivery Label — FEMNIA Hub');
  const access = useQuery(accessQuery);
  if (access.isPending) return <div className="p-6 text-sm text-muted-foreground">Loading label…</div>;
  if (access.isError) return <Navigate to="/hub/login" replace />;
  return <LabelPrint />;
}

function LabelPrint() {
  const { orderId } = useParams();
  const [search] = useSearchParams();
  const requested = ['100x150', '100x130'].includes(search.get('size')) ? search.get('size') : null;
  const autoprint = search.get('autoprint') === '1' || search.get('autoprint') === 'true';
  const order = useQuery(salesOrderQuery(orderId));
  const settings = useQuery(appSettingsQuery);
  const printed = useRef(false);
  const size = requested ?? settings.data?.labelSize ?? '100x130';
  const business = {
    name: settings.data?.businessName ?? 'FEMNIA',
    location: settings.data?.location ?? 'Al Thumama, Qatar',
    phone: settings.data?.phone ?? '66543343',
    currency: settings.data?.currency ?? 'QAR',
    footer: settings.data?.labelFooter ?? '',
  };
  usePageSize(size);

  useEffect(() => {
    if (!autoprint || printed.current || !order.data) return undefined;
    printed.current = true;
    let cancelled = false;
    void Promise.resolve(document.fonts?.ready).then(() => {
      if (cancelled) return;
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    });
    return () => {
      cancelled = true;
    };
  }, [autoprint, order.data]);

  if (order.isPending) {
    return <div className="p-6 text-sm text-muted-foreground">Loading label…</div>;
  }
  if (order.isError || !order.data) {
    return (
      <div className="p-6 text-sm">
        <p className="font-medium">This label could not be loaded.</p>
        <p className="mt-1 text-muted-foreground">
          {order.error?.response?.data?.message || order.error?.message || 'Order not found.'}
        </p>
      </div>
    );
  }

  // Portalled into <body>: the print CSS hides every other body child (the app).
  return createPortal(
    <>
      <div className="delivery-label-print-root">
        <DeliveryLabel order={order.data} size={size} business={business} productCodes={order.data.productCodes ?? {}} />
      </div>
      <div className="no-print flex flex-wrap items-center gap-2 p-4">
        <button
          type="button"
          onClick={() => window.print()}
          className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Print / Save as PDF
        </button>
        <span className="text-xs text-muted-foreground">
          Label size {size.replace('x', ' × ')} mm · one page · scale 100%, margins none.
        </span>
      </div>
    </>,
    document.body,
  );
}
