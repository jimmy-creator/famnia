import sharedThemes from '../../themes/shared';

export const defaultTheme = 'femnia';

const store4Themes = {
  ...sharedThemes,

  femnia: {
    name: 'Femnia',
    description: 'Cream, ink & gold — women’s fashion',
    vars: {
      '--font-display': "'Playfair Display', Georgia, serif",
      '--font-body':    "'Jost', system-ui, sans-serif",
      // Primary is near-black: the mockup's buttons (SHOP NOW, JOIN NOW),
      // promo band and bottom-nav pill are all ink, with gold as the accent.
      '--copper':       '#17130f',
      '--copper-light': '#3a322b',
      '--copper-dark':  '#0b0908',
      '--gold':         '#c08b5c',
      '--bg':           '#faf6f0',
      '--bg-warm':      '#efe4d5',
      '--bg-card':      '#ffffff',
      '--bg-dark':      '#141210',
      '--bg-dark-warm': '#221d18',
      '--text':         '#1b1714',
      '--text-secondary': '#6b6058',
      '--text-light':   '#a89c91',
      '--text-inverse': '#ffffff',
      '--border':       '#e6dccd',
      '--border-light': '#f2ebe0',
      '--success':      '#10b981',
      '--danger':       '#c0392b',
      '--radius':       '4px',
      '--radius-lg':    '6px',
    },
    font: 'Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Jost:wght@300;400;500;600',
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
