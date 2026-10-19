/**
 * An Instagram or YouTube link → its embed URL and shape. Null for anything
 * else (the hub only accepts these two, but older data is not trusted).
 */
export function videoEmbed(url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  const parts = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be' && parts[0]) {
    return { src: `https://www.youtube-nocookie.com/embed/${parts[0]}`, vertical: false };
  }
  if (host === 'youtube.com') {
    const id = u.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : null);
    if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}`, vertical: parts[0] === 'shorts' };
  }
  if (host === 'instagram.com') {
    const i = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
    if (i >= 0 && parts[i + 1]) {
      const kind = parts[i] === 'reels' ? 'reel' : parts[i];
      return { src: `https://www.instagram.com/${kind}/${parts[i + 1]}/embed`, vertical: true, instagram: true };
    }
  }
  return null;
}
