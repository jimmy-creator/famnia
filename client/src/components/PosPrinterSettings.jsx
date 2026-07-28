/**
 * Printer settings panel.
 *
 * Two independent printer pairings:
 *   - Receipt printer (80mm thermal at the counter, with cash drawer)
 *   - Barcode/label printer (smaller, label rolls)
 *
 * Pairing uses navigator.usb.requestDevice() which requires a user
 * gesture. The browser persists the authorisation; this panel
 * re-reads getDevice(kind) on mount to render the current state.
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  isSupported, isEnabled, setEnabled,
  getDevice, requestDevice, forget,
  testPrint, getColumns, setColumns,
  getReceiptLocale, setReceiptLocale,
} from '../lib/thermalPrinter';

const KINDS = [
  {
    id: 'receipt',
    title: 'Receipt printer',
    blurb: '80mm thermal — sales, returns, X/Z reports. Cash drawer kicks via this device.',
    widths: [
      { label: '58mm', cols: 32 },
      { label: '76mm', cols: 42 },
      { label: '80mm', cols: 48 },
    ],
  },
  {
    id: 'barcode',
    title: 'Label printer',
    blurb: 'Roll-fed label printer — Code128 product barcodes. Often 40×25 or 50×30mm rolls.',
    widths: [
      { label: '40mm', cols: 24 },
      { label: '50mm', cols: 32 },
      { label: '80mm', cols: 48 },
    ],
  },
];

function PrinterCard({ kind }) {
  const [enabled, setEnabledLocal] = useState(isEnabled(kind.id));
  const [paired, setPaired] = useState(null);
  const [cols, setColsLocal] = useState(getColumns(kind.id));
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    getDevice(kind.id)
      .then((handle) => setPaired(handle?.device || null))
      .catch(() => setPaired(null));
  };
  useEffect(refresh, [kind.id]);

  const handlePair = async () => {
    try {
      const handle = await requestDevice(kind.id);
      setPaired(handle.device);
      setEnabledLocal(true);
      toast.success(`Paired: ${handle.device.productName || handle.device.serialNumber || 'printer'}`);
    } catch (err) {
      if (err?.name !== 'NotFoundError') {
        toast.error(err.message || 'Pairing cancelled');
      }
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      await testPrint(kind.id);
      toast.success('Test sent');
    } catch (err) {
      toast.error(err.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  };

  const handleForget = async () => {
    if (!confirm('Forget this printer? You will need to re-pair to use direct print.')) return;
    await forget(kind.id);
    setPaired(null);
    setEnabledLocal(false);
    toast.success('Forgotten');
  };

  return (
    <div style={{ padding: '1rem', background: '#0f172a', borderRadius: 12, border: '1px solid #334155' }}>
      <h4 style={{ margin: '0 0 4px', color: '#f8fafc' }}>{kind.title}</h4>
      <p style={{ margin: '0 0 0.75rem', fontSize: 12, color: '#94a3b8' }}>{kind.blurb}</p>

      <div style={{ fontSize: 13, marginBottom: '0.75rem' }}>
        <div style={{ color: '#94a3b8' }}>Status</div>
        <div style={{ fontWeight: 600, color: paired && enabled ? '#34d399' : '#fbbf24' }}>
          {paired && enabled && (paired.productName || `Vendor ${paired.vendorId} Product ${paired.productId}`)}
          {paired && !enabled && 'Paired but disabled'}
          {!paired && 'Not paired'}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: '0.75rem' }}>
        <input
          type="checkbox" checked={enabled}
          onChange={(e) => { setEnabled(kind.id, e.target.checked); setEnabledLocal(e.target.checked); }}
        />
        <span>Use direct USB print</span>
      </label>

      <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 4 }}>Paper width</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: '0.75rem' }}>
        {kind.widths.map((w) => (
          <button
            key={w.cols}
            onClick={() => { setColumns(kind.id, w.cols); setColsLocal(w.cols); }}
            style={{
              flex: 1, padding: '0.5rem',
              background: cols === w.cols ? '#c4784a' : '#1e293b',
              border: cols === w.cols ? 'none' : '1px solid #334155',
              color: cols === w.cols ? '#fff' : '#cbd5e1',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
            }}>
            {w.label}
            <div style={{ fontSize: 10, opacity: 0.7 }}>{w.cols} cols</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={handlePair} className="modal-btn modal-btn-primary" style={{ flex: 1 }}>
          {paired ? 'Re-pair' : 'Pair'}
        </button>
        {paired && (
          <button onClick={handleTest} disabled={busy} className="modal-btn modal-btn-secondary" style={{ flex: 1 }}>
            {busy ? 'Sending…' : 'Test'}
          </button>
        )}
        {paired && (
          <button onClick={handleForget} className="modal-btn modal-btn-secondary" style={{ flex: 1 }}>
            Forget
          </button>
        )}
      </div>
    </div>
  );
}

function ReceiptLanguageCard() {
  const [locale, setLocale] = useState(getReceiptLocale());
  const opts = [
    { id: 'en', label: 'English', sub: 'Latin product names + KWD' },
    { id: 'ar', label: 'العربية', sub: 'Arabic names + د.ك' },
    { id: 'bi', label: 'Bilingual', sub: 'Both names · د.ك' },
  ];
  return (
    <div style={{ marginTop: '0.75rem', padding: '1rem', background: '#0f172a', borderRadius: 12, border: '1px solid #334155' }}>
      <h4 style={{ margin: '0 0 4px', color: '#f8fafc' }}>Receipt language</h4>
      <p style={{ margin: '0 0 0.75rem', fontSize: 12, color: '#94a3b8' }}>
        Applies to printed receipts (sale, return, X/Z). Uses the product&apos;s Arabic name when available, falls back to English.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => { setReceiptLocale(o.id); setLocale(o.id); }}
            style={{
              padding: '0.6rem',
              background: locale === o.id ? '#c4784a' : '#1e293b',
              border: locale === o.id ? 'none' : '1px solid #334155',
              color: locale === o.id ? '#fff' : '#cbd5e1',
              borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
              fontWeight: 600, fontSize: 14,
            }}>
            {o.label}
            <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 400, marginTop: 2 }}>{o.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PosPrinterSettings({ onClose }) {
  const supported = isSupported();

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Printers</h3>
          <button onClick={onClose} className="link-btn">Close</button>
        </div>

        {!supported && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(251,191,36,0.1)', borderRadius: 8, color: '#fbbf24', fontSize: 13 }}>
            Direct USB printing isn&apos;t available in this browser. Use Chrome
            or Edge on a desktop POS terminal. Receipts will fall back to
            the browser print dialog.
          </div>
        )}

        {supported && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              {KINDS.map((k) => <PrinterCard key={k.id} kind={k} />)}
            </div>

            <ReceiptLanguageCard />

            <p style={{ fontSize: 11, color: '#64748b', marginTop: '1rem' }}>
              Pairings are per-browser. The OS picker excludes the other paired
              printer so you can&apos;t accidentally double-pair.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
