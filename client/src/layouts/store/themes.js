import sharedThemes from '../../themes/shared';

export const defaultTheme = 'elegantBayt';

const store4Themes = {
  ...sharedThemes,

  elegantBayt: {
    name: 'Elegant Bayt',
    description: 'Deep navy & gold — plastic home appliances',
    vars: {
      '--font-display': "'Plus Jakarta Sans', system-ui, sans-serif",
      '--font-body':    "'Plus Jakarta Sans', system-ui, sans-serif",
      '--copper':       '#16264d',
      '--copper-light': '#26396b',
      '--copper-dark':  '#0f1c39',
      '--gold':         '#c6a24c',
      '--bg':           '#ffffff',
      '--bg-warm':      '#f5f6f9',
      '--bg-card':      '#ffffff',
      '--bg-dark':      '#16264d',
      '--bg-dark-warm': '#1d3160',
      '--text':         '#1a2540',
      '--text-secondary': '#5b6478',
      '--text-light':   '#9aa2b1',
      '--text-inverse': '#ffffff',
      '--border':       '#e5e7eb',
      '--border-light': '#f1f3f5',
      '--success':      '#10b981',
      '--danger':       '#ef4444',
      '--radius':       '12px',
      '--radius-lg':    '16px',
    },
    font: 'Plus+Jakarta+Sans:wght@300;400;500;600;700;800',
  },

  blanc: {
    name: 'Blanc',
    description: 'Pure white with warm gold accents',
    vars: {
      '--font-display': "'Instrument Serif', Georgia, serif",
      '--font-body':    "'Manrope', system-ui, sans-serif",
      '--copper':       '#b08754',
      '--copper-light': '#c9a47a',
      '--copper-dark':  '#8a6638',
      '--gold':         '#c9a04a',
      '--bg':           '#ffffff',
      '--bg-warm':      '#ffffff',
      '--bg-card':      'rgba(255, 255, 255, 0.85)',
      '--bg-dark':      '#171311',
      '--bg-dark-warm': '#241d18',
      '--text':         '#171311',
      '--text-secondary': '#5a5048',
      '--text-light':   '#a39b91',
      '--text-inverse': '#ffffff',
      '--border':       'rgba(23, 19, 17, 0.08)',
      '--border-light': 'rgba(23, 19, 17, 0.04)',
      '--success':      '#3B277E',
      '--danger':       '#e11d48',
      '--shadow-sm':    '0 2px 8px rgba(23, 19, 17, 0.05)',
      '--shadow':       '0 4px 16px rgba(23, 19, 17, 0.07)',
      '--shadow-md':    '0 12px 32px rgba(23, 19, 17, 0.09)',
      '--shadow-lg':    '0 24px 60px rgba(23, 19, 17, 0.12)',
      '--radius':       '16px',
      '--radius-lg':    '24px',
    },
    font: 'Instrument+Serif:ital@0;1&family=Manrope:wght@300;400;500;600;700',
  },
};

export default store4Themes;
