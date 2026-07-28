import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function AnnouncementBar() {
  const [items, setItems] = useState(() => {
    const cached = localStorage.getItem('cached-announcements');
    return cached ? JSON.parse(cached) : [];
  });

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

  if (!items.length) return null;

  // Duplicate the list so the marquee animation has a seamless loop.
  const loop = [...items, ...items];

  return (
    <div className="overflow-hidden bg-primary text-primary-foreground" role="region" aria-label="Announcements">
      <div className="flex w-max animate-[marquee_36s_linear_infinite] items-center py-2.5">
        {loop.map((text, i) => (
          <span key={i} className="flex items-center whitespace-nowrap text-xs font-medium tracking-wide">
            <span aria-hidden="true" className="px-2">✨</span>
            <span>{text}</span>
            <span className="px-7 opacity-60" aria-hidden="true">•</span>
          </span>
        ))}
      </div>
    </div>
  );
}
