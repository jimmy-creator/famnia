import { Setting } from '../models/index.js';

/**
 * FEMNIA Hub business settings, stored in the Setting key/value table under
 * `hub_*` keys (so they can never collide with the storefront's settings).
 * Settings are defaults for future work only — nothing here rewrites a
 * confirmed order, a printed invoice or a stock ledger row.
 */
export const SETTINGS_DEFAULTS = {
  businessName: 'FEMNIA',
  // Company identity printed on invoices, bills, POs, the store footer and policies.
  legalName: 'Femnia Online Trading WLL',
  crNumber: '244701',
  email: 'info@femnia.com',
  whatsapp: '97466543343',
  website: 'www.femniafashion.com',
  logoUrl: '',
  location: 'Qatar',
  phone: '+974 6654 3343',
  currency: 'QAR',
  invoicePrefix: 'FEM',
  customerPrefix: 'CUS',
  defaultOrderStatus: 'Draft',
  defaultDeliveryCharge: 15,
  courierNames: ['Own Driver', 'Snoonu', 'Talabat', 'Qatar Post'],
  labelSize: '100x130',
  defaultReorderLevel: 3,
  lowStockRule: 3,
  reorderMultiplier: 2,
  invoiceFooter: 'Thank you for shopping with FEMNIA.',
  labelFooter: 'Handle with care · Returns within 3 days with the invoice',
  categories: ['Abaya', 'Dress', 'Kids', 'Scarf', 'Set', 'Accessories'],
  sizes: ['Free', 'S', 'M', 'L', 'XL', '2-3Y', '4-5Y', '6-7Y', '8-9Y'],
  colours: ['Black', 'Cream', 'Navy', 'Plum', 'Blush', 'Lavender'],
  paymentMethods: ['Cash', 'Fawran', 'Card', 'Bank Transfer', 'COD'],
  paymentHolders: [
    'Company Bank Account', 'Company Fawran Account', 'Cash in Hand', 'Cash Drawer', 'Delivery Driver',
    'Customer Pickup Counter',
  ],
  deliveryPaymentModes: ['Cash', 'Fawran', 'Card', 'Bank Transfer'],
};

export const SETTING_KEYS = {
  businessName: 'hub_business_name',
  legalName: 'hub_legal_name',
  crNumber: 'hub_cr_number',
  email: 'hub_email',
  whatsapp: 'hub_whatsapp',
  website: 'hub_website',
  logoUrl: 'hub_logo_url',
  location: 'hub_location',
  phone: 'hub_phone',
  currency: 'hub_currency',
  invoicePrefix: 'hub_invoice_prefix',
  customerPrefix: 'hub_customer_prefix',
  defaultOrderStatus: 'hub_default_order_status',
  defaultDeliveryCharge: 'hub_default_delivery_charge',
  courierNames: 'hub_courier_names',
  labelSize: 'hub_label_size',
  defaultReorderLevel: 'hub_default_reorder_level',
  lowStockRule: 'hub_low_stock_rule',
  reorderMultiplier: 'hub_reorder_multiplier',
  invoiceFooter: 'hub_invoice_footer',
  labelFooter: 'hub_label_footer',
  categories: 'hub_list_categories',
  sizes: 'hub_list_sizes',
  colours: 'hub_list_colours',
  paymentMethods: 'hub_list_payment_methods',
  paymentHolders: 'hub_list_payment_holders',
  deliveryPaymentModes: 'hub_delivery_payment_modes',
};

const parseList = (raw) =>
  String(raw)
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);

function dedupe(items) {
  const out = [];
  for (const item of items) if (!out.some((o) => o.toLowerCase() === item.toLowerCase())) out.push(item);
  return out;
}

export async function loadAppSettings() {
  const rows = await Setting.findAll({ where: { key: Object.values(SETTING_KEYS) }, raw: true });
  const map = new Map(rows.map((r) => [r.key, String(r.value ?? '').trim()]));
  const out = {};
  for (const [field, key] of Object.entries(SETTING_KEYS)) {
    const fallback = SETTINGS_DEFAULTS[field];
    const raw = map.get(key);
    if (Array.isArray(fallback)) {
      const items = raw ? dedupe(parseList(raw)) : [];
      out[field] = items.length ? items : fallback;
    } else if (typeof fallback === 'number') {
      const n = Number(raw);
      out[field] = raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
    } else if (field === 'logoUrl') {
      out[field] = raw ?? '';
    } else {
      out[field] = raw || fallback;
    }
  }
  out.labelSize = out.labelSize === '100x150' ? '100x150' : '100x130';
  cachedCompany = companyFrom(out);
  return out;
}

/** The public company identity: what customers, suppliers and every document see. */
const companyFrom = (s) => ({
  brandName: s.businessName,
  legalName: s.legalName,
  crNumber: s.crNumber,
  address: s.location,
  phone: s.phone,
  whatsapp: s.whatsapp,
  email: s.email,
  website: s.website,
});

let cachedCompany = companyFrom(SETTINGS_DEFAULTS);

export async function companyProfile() {
  return companyFrom(await loadAppSettings());
}

/** Last-loaded profile, for synchronous templates (emails); refreshed by every settings read. */
export const cachedCompanyProfile = () => cachedCompany;
