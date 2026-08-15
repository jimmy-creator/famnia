/**
 * Print barcode labels from the POS.
 *
 * Search a product, choose how many labels, then browser-print using the
 * SAME shared label sheet as Admin → Barcode Labels, so the output is
 * identical. Labels carry the store name, product name, barcode (CODE128 of
 * the product code or the P<id> fallback), the readable code, and the price.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HiSearch, HiX, HiPrinter } from 'react-icons/hi';
import api from '../api/axios';
import { LABEL_SIZES, BarcodeLabelSheet, BarcodeLabelStyles } from './BarcodeLabelSheet';

const LABEL_SHOW = { brand: true, name: true, barcode: true, sku: true, price: true };
const SIZE = LABEL_SIZES.find((s) => s.id === 'medium');   // 50×25mm roll — matches admin default
const LAYOUT = 'roll';

export default function PosLabelPrint({ currency = 'KWD', onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const { data } = await api.get('/pos/products', { params: { q } });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  // One entry per physical label (matches admin's flattened sheet input).
  const flatLabels = useMemo(() => {
    if (!selected) return [];
    return Array.from({ length: qty }, () => ({
      productId: selected.productId, name: selected.name,
      code: selected.code, price: selected.price,
    }));
  }, [selected, qty]);

  const print = () => {
    if (!selected) return;
    // Let JsBarcode finish drawing the portaled SVGs before printing.
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 0.75rem' }}>Print barcode label</h3>

        <div className="search-bar" style={{ marginBottom: '0.75rem' }}>
          <HiSearch size={18} style={{ opacity: 0.5 }} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Scan or search product…"
            style={{ background: 'transparent', border: 'none', color: 'inherit', padding: '0.6rem 0.5rem', width: '100%', outline: 'none', fontSize: '1rem' }}
          />
          {query && <button onClick={() => { setQuery(''); setResults([]); }} className="icon-btn"><HiX size={16} /></button>}
        </div>

        {!selected && (
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {searching && <div style={{ color: 'var(--pos-text-2)', padding: '0.5rem' }}>Searching…</div>}
            {!searching && query && results.length === 0 && (
              <div style={{ color: 'var(--pos-text-2)', padding: '0.5rem' }}>No products found</div>
            )}
            {results.map((r, i) => (
              <button
                key={`${r.productId}-${i}`}
                onClick={() => { setSelected(r); setQty(1); }}
                className="label-result"
              >
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--pos-text-2)', fontFamily: 'ui-monospace, monospace' }}>{r.code || `P${r.productId}`}</span>
                </span>
                <span style={{ fontWeight: 700 }}>{currency} {(parseFloat(r.price) || 0).toFixed(3)}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div>
            <div className="label-selected">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: 'var(--pos-text-2)', fontFamily: 'ui-monospace, monospace' }}>
                  {selected.code || `P${selected.productId}`} · {currency} {(parseFloat(selected.price) || 0).toFixed(3)}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="icon-btn"><HiX size={16} /></button>
            </div>

            <label className="modal-label" style={{ marginTop: '0.75rem' }}>Number of labels</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="qty-step">−</button>
              <input
                type="number" min={1} value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || 1, 10)))}
                className="modal-input" style={{ width: 80, textAlign: 'center' }}
              />
              <button onClick={() => setQty((q) => q + 1)} className="qty-step">+</button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose} className="modal-btn modal-btn-secondary">Close</button>
          <button
            onClick={print}
            disabled={!selected}
            className="modal-btn modal-btn-primary"
          >
            <HiPrinter style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {`Print ${qty} label${qty === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* Shared print sheet (hidden on screen; window.print() prints only this) */}
      <BarcodeLabelStyles size={SIZE} layout={LAYOUT} />
      <BarcodeLabelSheet labels={flatLabels} size={SIZE} show={LABEL_SHOW} currency={currency} layout={LAYOUT} />
    </div>
  );
}
