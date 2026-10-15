import { FaInstagram } from 'react-icons/fa6';
import { useTranslation } from 'react-i18next';
import { INSTAGRAM_ACCOUNTS } from '@/lib/social';

/** Contact-card styled block listing each Instagram account as its own link. */
export default function InstagramCard() {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
        <FaInstagram className="size-5" />
      </span>
      <div className="not-prose">
        <h4 className="text-sm font-semibold text-foreground">{t('contact.instagram')}</h4>
        <p className="flex flex-col text-sm text-muted-foreground">
          {INSTAGRAM_ACCOUNTS.map((a) => (
            <a key={a.handle} href={a.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
              @{a.handle}
            </a>
          ))}
        </p>
      </div>
    </div>
  );
}
