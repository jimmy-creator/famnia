import { FaWhatsapp } from 'react-icons/fa6';

import { Button } from '@/hub/ui/button';
import { orderStatusMessage, whatsappLink } from '@/hub/lib/whatsapp';
import { cn } from '@/lib/utils';

/**
 * Opens WhatsApp (on this staff member's phone or computer) to the customer
 * with a message drafted for the order's current status. Nothing is sent
 * until staff press send in WhatsApp. A second number gets its own button.
 */
export function CustomerWhatsApp({ order, compact = false, className }) {
  const text = orderStatusMessage(order);
  const numbers = [order.phone, order.altPhone].filter(Boolean);
  const links = numbers.map((n) => ({ n, href: whatsappLink(n, text) })).filter((l) => l.href);
  if (!links.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-2', className)} onClick={(e) => e.stopPropagation()}>
      {links.map(({ n, href }, i) => (
        <Button
          key={n}
          asChild
          size="sm"
          className={cn('gap-1.5 bg-[#25D366] text-white hover:bg-[#1ebe5a]', compact ? 'h-8 px-2' : 'h-9')}
        >
          <a href={href} target="_blank" rel="noopener noreferrer" title={`WhatsApp ${n} about ${order.status}`}>
            <FaWhatsapp className="size-4" />
            {compact ? (i ? '2' : null) : i ? 'WhatsApp no. 2' : 'WhatsApp customer'}
          </a>
        </Button>
      ))}
    </div>
  );
}
