import { useEffect, useState } from 'react';
import api from '../api/axios';

// The company identity: legal name, CR number and contact details. Edited in
// Hub → Settings and served by /api/settings/company; these defaults render
// first (and stay if the request fails), so pages never show blanks.
export const DEFAULT_COMPANY = {
  brandName: 'FEMNIA',
  legalName: 'Femnia Online Trading WLL',
  crNumber: '244701',
  address: 'Qatar',
  phone: '+974 6654 3343',
  whatsapp: '97466543343',
  email: 'info@femnia.com',
  website: 'www.femniafashion.com',
};

let cached = null;
let pending = null;

function load() {
  if (!pending) {
    pending = api
      .get('/settings/company')
      .then(({ data }) => {
        cached = { ...DEFAULT_COMPANY, ...Object.fromEntries(Object.entries(data || {}).filter(([, v]) => v)) };
        return cached;
      })
      .catch(() => {
        pending = null;
        return cached ?? DEFAULT_COMPANY;
      });
  }
  return pending;
}

/** Company details for storefront pages; one request per page load. */
export function useCompany() {
  const [company, setCompany] = useState(cached ?? DEFAULT_COMPANY);
  useEffect(() => {
    let live = true;
    load().then((c) => live && setCompany(c));
    return () => {
      live = false;
    };
  }, []);
  return company;
}

/** `tel:` link target for a display phone number. */
export const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
