import { BUSINESS } from '@/hub/components/Brand';

/** Header/footer details for printed invoices and labels: Settings, else the built-in defaults. */
export function printBusinessFrom(s) {
  return {
    name: s?.businessName ?? BUSINESS.name,
    legalName: s?.legalName ?? BUSINESS.legalName,
    crNumber: s?.crNumber ?? BUSINESS.crNumber,
    email: s?.email ?? BUSINESS.email,
    location: s?.location ?? BUSINESS.location,
    phone: s?.phone ?? BUSINESS.phone,
    currency: s?.currency ?? BUSINESS.currency,
    invoiceFooter: s?.invoiceFooter ?? 'Thank you for shopping with FEMNIA.',
    labelFooter: s?.labelFooter ?? '',
    logoUrl: s?.logoUrl ?? '',
  };
}
