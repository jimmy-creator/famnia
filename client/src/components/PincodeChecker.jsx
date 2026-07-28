import { useState } from 'react';
import { MapPin, Truck, Check, X } from 'lucide-react';
import api from '../api/axios';

export default function PincodeChecker() {
  const [pincode, setPincode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!pincode.trim() || pincode.length < 4) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/pincodes/check/${pincode.trim()}`);
      setResult(data);
    } catch {
      setResult({ available: false, message: 'Unable to check delivery' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pincode-checker">
      <div className="pincode-input-row">
        <MapPin size={16} className="pincode-icon" />
        <input
          type="text"
          value={pincode}
          onChange={(e) => { setPincode(e.target.value.replace(/\D/g, '').slice(0, 6)); setResult(null); }}
          placeholder="Enter pincode"
          maxLength={6}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
        />
        <button onClick={handleCheck} disabled={loading || pincode.length < 4}>
          {loading ? '...' : 'Check'}
        </button>
      </div>

      {result && (
        <div className={`pincode-result ${result.available ? 'available' : 'unavailable'}`}>
          {result.available ? (
            <>
              <div className="pincode-result-row">
                <Check size={14} />
                <span>{result.message}</span>
              </div>
              {result.city && (
                <div className="pincode-result-row sub">
                  <Truck size={14} />
                  <span>{result.city}{result.state ? `, ${result.state}` : ''}</span>
                </div>
              )}
              {result.codAvailable && (
                <div className="pincode-result-row sub">
                  <Check size={14} />
                  <span>Cash on Delivery available</span>
                </div>
              )}
            </>
          ) : (
            <div className="pincode-result-row">
              <X size={14} />
              <span>{result.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
