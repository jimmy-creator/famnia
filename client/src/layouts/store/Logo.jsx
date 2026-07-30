/**
 * Femnia brand marks.
 *
 * These are rasters rather than the inline SVG they replaced: the supplied
 * artwork is a photographed lockup with a gold gradient arc and embossed
 * letterforms, none of which survives being redrawn as tintable paths. So the
 * mark can no longer inherit `currentColor`, and each surface picks a variant
 * instead — `tone="light"` is the cream silhouette for the copper footer and
 * the dark bottom-nav pill. Built from the source mockup by keying out the
 * studio background; see client/public/images/femnia-logo*.webp.
 */

const LOCKUP = {
  ink: { src: '/images/femnia-logo.webp', width: 384, height: 384 },
  light: { src: '/images/femnia-logo-light.webp', width: 392, height: 384 },
};

/** Arc + FN monogram only — for the dark bottom-nav pill. */
export function FemniaMonogram({ className = '', title = 'Femnia' }) {
  return (
    <img
      src="/images/femnia-monogram-light.webp"
      alt={title}
      width={425}
      height={384}
      className={className}
    />
  );
}

/** Full stacked lockup — arc + FN monogram over the FEMNIA wordmark. */
export default function FemniaLogo({ className = '', title = 'Femnia', tone = 'ink' }) {
  const { src, width, height } = LOCKUP[tone];
  return <img src={src} alt={title} width={width} height={height} className={className} />;
}
