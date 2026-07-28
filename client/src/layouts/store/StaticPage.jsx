import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SEO from '../../components/SEO';

const STORE_NAME = import.meta.env.VITE_STORE_NAME || 'Elegant Bayt';

export default function StaticPage({ title, titleAr, description, descriptionAr, children }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const displayTitle = isAr && titleAr ? titleAr : title;
  const displayDesc = isAr && descriptionAr ? descriptionAr : description;
  const homePath = isAr ? '/ar' : '/';
  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      <SEO title={displayTitle} description={displayDesc} />
      <Link to={homePath} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <BackIcon className="size-4" /> {isAr ? 'العودة إلى الرئيسية' : 'Back to home'}
      </Link>
      <div className="border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{STORE_NAME}</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{displayTitle}</h1>
      </div>
      <div
        className="mt-8 text-sm leading-relaxed text-muted-foreground
          [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground
          [&_h3]:mt-6 [&_h3]:font-medium [&_h3]:text-foreground
          [&_p]:mt-3
          [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5
          [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5
          [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline
          [&_strong]:font-semibold [&_strong]:text-foreground
          [&_section]:mt-2
          [&_.s2-static-date]:text-xs [&_.s2-static-date]:uppercase [&_.s2-static-date]:tracking-wide"
      >
        {children}
      </div>
    </div>
  );
}
