/**
 * Femnia brand marks — inline SVG, fully transparent, no raster assets.
 *
 * Rendered inline (not via <img src>) on purpose: that way the letterforms
 * use the theme's loaded display webfont (Playfair Display) and the ink
 * strokes inherit `currentColor`, so the same mark works on the cream navbar
 * and on the dark footer/bottom-nav without a second file.
 */

// Gold ring: open arc sweeping from lower-left up over the top and down the
// right, mirroring the swash in the brand mark.
const RING_D = 'M 74.6 63.4 A 32 32 0 1 1 126.5 50.2';

/** Arc + FN monogram only — for favicons, avatars and the bottom-nav pill. */
export function FemniaMonogram({ className = '', title = 'Femnia' }) {
  return (
    <svg viewBox="0 0 200 96" className={className} role="img" aria-label={title}>
      <path d={RING_D} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
      <text
        x="103"
        y="62"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="52"
        letterSpacing="-6"
      >
        FN
      </text>
    </svg>
  );
}

/** Full stacked lockup — arc + FN monogram over the FEMNIA wordmark. */
export default function FemniaLogo({ className = '', title = 'Femnia' }) {
  return (
    <svg viewBox="0 0 200 132" className={className} role="img" aria-label={title}>
      <path d={RING_D} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
      <text
        x="103"
        y="62"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="52"
        letterSpacing="-6"
      >
        FN
      </text>
      <text
        x="105"
        y="115"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-display), Georgia, serif"
        fontSize="21"
        letterSpacing="10"
      >
        FEMNIA
      </text>
    </svg>
  );
}
