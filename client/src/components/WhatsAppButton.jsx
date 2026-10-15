import { FaWhatsapp } from 'react-icons/fa6';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Storefront button in WhatsApp green. With no children it renders the icon alone. */
export default function WhatsAppButton({ className, children, ...props }) {
  return (
    <Button
      type="button"
      className={cn('gap-2 bg-[#25D366] text-white hover:bg-[#1ebe5a] focus-visible:ring-[#25D366]/40', className)}
      {...props}
    >
      <FaWhatsapp className="size-5" />
      {children}
    </Button>
  );
}
