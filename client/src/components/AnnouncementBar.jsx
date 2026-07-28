import { useEffect, useState } from 'react';
import api from '../api/axios';

const ROTATE_MS = 4500;

/**
 * Slim promo bar pinned above the navbar. Messages come from
 * Admin → Settings → Theme → Announcement Bar; with more than one configured
 * they cross-fade in sequence. Renders nothing when none are set.
 */
export default function AnnouncementBar() {
  const [items, setItems] = useState(() => {
    const cached = localStorage.getItem('cached-announcements');
    return cached ? JSON.parse(cached) : [];
  });
  const [active, setActive] = useState(0);

  useEffect(() => {
    api.get('/settings/announcements')
      .then((res) => {
        if (Array.isArray(res.data)) {
          setItems(res.data);
          localStorage.setItem('cached-announcements', JSON.stringify(res.data));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => setActive((prev) => prev + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [items.length]);

  if (!items.length) return null;

  // Wrap on read rather than resetting `active` in an effect, so a shrinking
  // list can never leave the index pointing past the end.
  const shown = active % items.length;

  return (
    <div className="bg-foreground px-4 py-2.5 text-center" role="region" aria-label="Announcements">
      {/* Grid-stacked so the bar keeps the height of its tallest message and
          never jumps as they rotate. */}
      <div className="grid">
        {items.map((text, i) => (
          <p
            key={i}
            aria-hidden={shown !== i}
            className={`col-start-1 row-start-1 text-[10px] font-medium uppercase tracking-[0.2em] text-background transition-opacity duration-500 sm:text-[11px] ${
              shown === i ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {text}
          </p>
        ))}
      </div>
    </div>
  );
}
