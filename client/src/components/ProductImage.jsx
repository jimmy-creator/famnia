const categoryIcons = {
  Electronics: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="16" width="44" height="32" rx="3" stroke="currentColor" strokeWidth="2"/>
      <path d="M24 54h32M32 48v6M48 48v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="40" cy="32" r="6" stroke="currentColor" strokeWidth="2"/>
      <path d="M40 28v8M36 32h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Clothing: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 18l-14 10 6 6 4-3v30h28V31l4 3 6-6-14-10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M30 18c0 5.5 4.5 10 10 10s10-4.5 10-10" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  Footwear: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 48c0-8 4-14 10-18l6-8h8l2 8c8 2 16 6 22 10l4 8H14z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M18 48h48v6c0 2-2 4-4 4H22c-2 0-4-2-4-4v-6z" stroke="currentColor" strokeWidth="2"/>
      <path d="M36 36l2-4M42 34l1-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Accessories: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="18" y="28" width="44" height="28" rx="4" stroke="currentColor" strokeWidth="2"/>
      <path d="M28 28v-4a12 12 0 0124 0v4" stroke="currentColor" strokeWidth="2"/>
      <circle cx="40" cy="42" r="4" stroke="currentColor" strokeWidth="2"/>
      <path d="M40 46v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Sports: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="20" stroke="currentColor" strokeWidth="2"/>
      <path d="M40 20v40M20 40h40" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M26 26c4 4 10 6 14 6s10-2 14-6M26 54c4-4 10-6 14-6s10 2 14 6" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  Home: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 38l24-18 24 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 34v24h36V34" stroke="currentColor" strokeWidth="2"/>
      <rect x="34" y="42" width="12" height="16" rx="1" stroke="currentColor" strokeWidth="2"/>
      <path d="M34 50h12" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  Beauty: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 20h16v8c0 2 2 4 4 4v20c0 4-4 8-8 8h-8c-4 0-8-4-8-8V32c2 0 4-2 4-4v-8z" stroke="currentColor" strokeWidth="2"/>
      <path d="M32 38h16M32 44h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="40" cy="14" r="2" fill="currentColor"/>
    </svg>
  ),
  Food: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="40" cy="44" rx="22" ry="8" stroke="currentColor" strokeWidth="2"/>
      <path d="M18 44v6c0 4.5 10 8 22 8s22-3.5 22-8v-6" stroke="currentColor" strokeWidth="2"/>
      <path d="M24 40c2-10 8-18 16-18s14 8 16 18" stroke="currentColor" strokeWidth="2"/>
      <path d="M40 22v-4M36 24l-2-3M44 24l2-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Books: (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 16h16c4 0 4 2 4 4v40c0-2-2-4-6-4H20V16z" stroke="currentColor" strokeWidth="2"/>
      <path d="M60 16H44c-4 0-4 2-4 4v40c0-2 2-4 6-4h14V16z" stroke="currentColor" strokeWidth="2"/>
      <path d="M26 26h8M26 32h6M48 26h8M48 32h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

const categoryGradients = {
  Electronics: ['#2c3e50', '#34495e', '#546e7a'],
  Clothing: ['#4a3728', '#5d4037', '#6d4c41'],
  Footwear: ['#37474f', '#455a64', '#546e7a'],
  Accessories: ['#3e2723', '#4e342e', '#5d4037'],
  Sports: ['#1b5e20', '#2e7d32', '#388e3c'],
  Home: ['#4a148c', '#6a1b9a', '#7b1fa2'],
  Beauty: ['#880e4f', '#ad1457', '#c2185b'],
  Food: ['#bf360c', '#d84315', '#e64a19'],
  Books: ['#1a237e', '#283593', '#303f9f'],
};

const defaultGradient = ['#3e3632', '#4a423e', '#564e48'];

import { useState } from 'react';

export default function ProductImage({ product, size = 'normal', fit = 'cover' }) {
  const [imgError, setImgError] = useState(false);

  const cat = product.category || 'default';
  const colors = categoryGradients[cat] || defaultGradient;
  const Icon = categoryIcons[cat] || categoryIcons['Accessories'];

  const sizeStyles = {
    small: { width: 72, height: 72, iconSize: 28 },
    normal: { width: '100%', height: '100%', iconSize: 48 },
    large: { width: '100%', height: '100%', iconSize: 72 },
  };

  const s = sizeStyles[size];

  // Check if product has a real image
  const imageUrl = product.images?.length > 0 && product.images[0] ? product.images[0] : null;
  const hasImage = imageUrl && !imgError;

  if (hasImage) {
    const isContain = fit === 'contain';
    return (
      <div style={{
        width: s.width, height: s.height,
        position: 'relative', overflow: 'hidden',
        borderRadius: size === 'small' ? 'var(--radius)' : 0,
        background: isContain ? '#ffffff' : `linear-gradient(160deg, ${colors[0]}, ${colors[1]})`,
        padding: isContain ? 8 : 0,
      }}>
        <img
          src={imageUrl}
          alt={product.name}
          loading="lazy"
          onError={() => setImgError(true)}
          style={{
            width: '100%', height: '100%',
            objectFit: fit,
            display: 'block',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: s.width,
        height: s.height,
        background: `linear-gradient(160deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size === 'small' ? 0 : 8,
        color: 'rgba(255,255,255,0.25)',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: size === 'small' ? 'var(--radius)' : 0,
      }}
    >
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.06,
        backgroundImage: `radial-gradient(circle at 25% 25%, rgba(255,255,255,0.3) 1px, transparent 1px),
                          radial-gradient(circle at 75% 75%, rgba(255,255,255,0.3) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }} />
      <div style={{
        position: 'absolute',
        top: '20%', left: '30%',
        width: '40%', height: '40%',
        background: `radial-gradient(ellipse, rgba(255,255,255,0.08) 0%, transparent 70%)`,
        borderRadius: '50%',
      }} />
      <div style={{
        width: s.iconSize, height: s.iconSize,
        color: 'rgba(255,255,255,0.35)',
        position: 'relative', zIndex: 1,
      }}>
        {Icon}
      </div>
      {size !== 'small' && (
        <span style={{
          fontSize: size === 'large' ? '0.75rem' : '0.65rem',
          fontWeight: 500,
          letterSpacing: '2px',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.2)',
          position: 'relative', zIndex: 1,
          fontFamily: "'Outfit', sans-serif",
        }}>
          {cat}
        </span>
      )}
    </div>
  );
}
