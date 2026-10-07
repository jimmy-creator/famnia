/**
 * Keyboard-driven product search for the purchasing screens (purchase
 * orders, purchase returns).
 *
 * Type → ↑/↓ to highlight → Enter picks it (Esc clears). Enter never
 * bubbles up to submit the surrounding form. Each variant is its own row.
 * Rows show the product's cost price — what these screens deal in — rather
 * than its retail price.
 *
 * Barcode scanners type the code and press Enter: an exact barcode / code /
 * variant SKU match is added straight away and reported to onPick as
 * { scanned: true }, so the editor can keep focus here for the next scan.
 */
import { useState, useMemo, forwardRef } from 'react';
import toast from 'react-hot-toast';

const norm = (s) => String(s ?? '').trim().toLowerCase();

// The product (and variant) whose barcode, code or SKU is exactly `q`.
function exactMatch(products, q) {
  for (const p of products || []) {
    const vi = (p.variants || []).findIndex((v) => norm(v.barcode) === q || norm(v.sku) === q);
    if (vi >= 0) return { p, vi };
    if (norm(p.barcode) === q || norm(p.code) === q) return { p, vi: null };
  }
  return null;
}

const ProductSearchPicker = forwardRef(function ProductSearchPicker({ products, currency, onPick, hint }, ref) {
  const [search, setSearch] = useState('');
  const [hit, setHit] = useState(0);
  const fmt = (n) => `${currency}${(parseFloat(n) || 0).toFixed(3)}`;

  const options = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return (products || [])
      .filter((p) => p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q))
      .slice(0, 8)
      .flatMap((p) => (
        Array.isArray(p.variants) && p.variants.length > 0
          ? p.variants.map((v, vi) => ({ p, vi, key: `${p.id}-${vi}`, variant: Object.values(v.options || {}).join('/') }))
          : [{ p, vi: null, key: String(p.id), variant: null }]
      ));
  }, [search, products]);

  const pick = (o) => {
    onPick(o.p, o.vi);
    setSearch('');
    setHit(0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && options.length) { e.preventDefault(); setHit((h) => (h + 1) % options.length); }
    else if (e.key === 'ArrowUp' && options.length) { e.preventDefault(); setHit((h) => (h - 1 + options.length) % options.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const q = norm(search);
      const exact = q && exactMatch(products, q);
      if (exact) {
        onPick(exact.p, exact.vi, { scanned: true });
        setSearch('');
        setHit(0);
      } else if (options[hit]) {
        pick(options[hit]);
      } else if (q) {
        toast.error(`No product matches "${search.trim()}"`);
        setSearch('');
      }
    } else if (e.key === 'Escape' && search) { e.preventDefault(); setSearch(''); setHit(0); }
  };

  return (
    <div style={{ background: 'var(--bg-warm, #f5f1e8)', padding: '0.75rem', borderRadius: 8, marginBottom: '0.75rem' }}>
      <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Add items</label>
      <input
        ref={ref}
        placeholder="Scan barcode or search products by name or code…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setHit(0); }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls="product-search-hits"
        aria-activedescendant={options[hit] ? `product-hit-${options[hit].key}` : undefined}
        style={{ width: '100%' }}
      />
      {options.length > 0 && (
        <div id="product-search-hits" role="listbox" style={{ background: 'white', border: '1px solid var(--border-light)', borderRadius: 6, marginTop: 6, maxHeight: 200, overflowY: 'auto' }}>
          {options.map((o, i) => (
            <div
              key={o.key}
              id={`product-hit-${o.key}`}
              role="option"
              aria-selected={i === hit}
              style={{ ...hitRow, ...(i === hit && hitRowActive) }}
              onMouseEnter={() => setHit(i)}
              onClick={() => pick(o)}
            >
              <span>{o.p.name}{o.variant && <span style={{ color: 'var(--text-light)' }}> ({o.variant})</span>}</span>
              <span style={{ color: 'var(--text-light)', fontSize: 12 }}>
                {parseFloat(o.p.costPrice) > 0 ? `cost ${fmt(o.p.costPrice)}` : 'no cost yet'}
              </span>
            </div>
          ))}
        </div>
      )}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
});

export default ProductSearchPicker;

const hitRow = {
  display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem',
  cursor: 'pointer', borderBottom: '1px solid var(--border-light)',
};
// The keyboard-highlighted row.
const hitRowActive = {
  background: 'color-mix(in srgb, var(--primary) 12%, white)',
  boxShadow: 'inset 3px 0 0 var(--primary)',
};
