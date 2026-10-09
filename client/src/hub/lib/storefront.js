/** Storefront (product-level) field helpers shared by the product dialogs. */
export const I18N = import.meta.env.VITE_FEATURE_I18N === 'true';

/** Blank storefront values for a new product. */
export const emptyStorefront = () => ({
  categories: [],
  images: [],
  comparePrice: '',
  featured: false,
  taxable: false,
  taxRate: '',
  hsnCode: '',
  hideOnline: false,
  nameAr: '',
  descriptionAr: '',
  reorderQty: '',
});

/** Storefront values from the API shape (numbers → strings for inputs). */
export const storefrontForm = (s) => ({
  categories: s?.categories ?? [],
  images: s?.images ?? [],
  comparePrice: s?.comparePrice ?? '',
  featured: Boolean(s?.featured),
  taxable: Boolean(s?.taxable),
  taxRate: s?.taxRate ?? '',
  hsnCode: s?.hsnCode ?? '',
  hideOnline: Boolean(s?.hideOnline),
  nameAr: s?.nameAr ?? '',
  descriptionAr: s?.descriptionAr ?? '',
  reorderQty: s?.reorderQty ?? '',
});

/** Form values → API payload (blank numbers become null). */
export const storefrontPayload = (f) => ({
  categories: f.categories,
  images: f.images,
  comparePrice: f.comparePrice === '' ? null : Number(f.comparePrice),
  featured: f.featured,
  taxable: f.taxable,
  taxRate: f.taxRate === '' ? null : Number(f.taxRate),
  hsnCode: f.hsnCode || null,
  hideOnline: f.hideOnline,
  ...(I18N ? { nameAr: f.nameAr || null, descriptionAr: f.descriptionAr || null } : {}),
  reorderQty: f.reorderQty === '' ? null : Number(f.reorderQty),
});
