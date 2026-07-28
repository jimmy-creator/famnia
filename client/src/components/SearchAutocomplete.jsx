import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import api from '../api/axios';
import ProductImage from './ProductImage';
import { CURRENCY } from '../utils/currency';

export default function SearchAutocomplete({ onSubmit, className = '', placeholder = 'Search for products...' }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Fetch suggestions with debounce
  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/products/search-suggestions?q=${encodeURIComponent(query)}`);
        setSuggestions(data);
        setShowDropdown(data.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      setShowDropdown(false);
      navigate(`/products?search=${encodeURIComponent(query.trim())}`);
      setQuery('');
      if (onSubmit) onSubmit();
    }
  };

  const handleSelect = (product) => {
    setShowDropdown(false);
    setQuery('');
    navigate(`/product/${product.slug}`);
    if (onSubmit) onSubmit();
  };

  const handleKeyDown = (e) => {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`search-ac-wrapper ${className}`}>
      <form className="search-ac-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <button type="submit" aria-label="Search"><Search size={16} strokeWidth={1.5} /></button>
      </form>

      {showDropdown && (
        <div className="search-ac-dropdown">
          {suggestions.map((product, i) => (
            <button
              key={product.id}
              className={`search-ac-item ${activeIndex === i ? 'active' : ''}`}
              onClick={() => handleSelect(product)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <div className="search-ac-img">
                <ProductImage product={product} size="small" />
              </div>
              <div className="search-ac-info">
                <span className="search-ac-name">{product.name}</span>
                <span className="search-ac-meta">
                  {product.category} · {CURRENCY}{parseFloat(product.price).toFixed(2)}
                </span>
              </div>
            </button>
          ))}
          <button className="search-ac-viewall" onClick={handleSubmit}>
            View all results for "{query}"
          </button>
        </div>
      )}
    </div>
  );
}
