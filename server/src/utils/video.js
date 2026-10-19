// Product videos are links to Instagram or YouTube, embedded on the product page.
const VIDEO_HOSTS = /^(www\.|m\.)?(youtube\.com|youtu\.be|instagram\.com)$/i;

/** A trimmed Instagram/YouTube https link, null when blank; throws a message for anything else. */
export function cleanVideoUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || !VIDEO_HOSTS.test(url.hostname) || raw.length > 500) {
    throw new Error('Video must be an https:// Instagram or YouTube link.');
  }
  return raw;
}
