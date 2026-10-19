import { cn } from '@/lib/utils';
import { videoEmbed } from '@/lib/videoEmbed';

/** The product's (or the selected colour's) video, embedded. Renders nothing for an unusable link. */
export default function ProductVideo({ url, title, className }) {
  const embed = videoEmbed(url);
  if (!embed) return null;
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-muted',
      embed.vertical ? 'mx-auto w-full max-w-sm' : 'w-full', className)}>
      <iframe
        key={embed.src}
        src={embed.src}
        title={title ? `${title} — video` : 'Product video'}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        // Instagram's embed adds a header and caption around the clip.
        className={cn('block w-full border-0', embed.instagram ? 'h-[620px]' : embed.vertical ? 'aspect-[9/16]' : 'aspect-video')}
      />
    </div>
  );
}
