import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';
import { EnglishBody, ArabicBody } from './ReturnPolicy';

// Refunds are one part of the Return & Exchange Policy, so this page carries the same text.
export default function RefundPolicy() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="Refund Policy"
      titleAr="سياسة استرداد المبالغ"
      description="FEMNIA refund policy: no refunds for size issues or change of mind; refunds only for verified damaged, defective or incorrect products. 7-day exchanges."
      descriptionAr="سياسة استرداد المبالغ لدى FEMNIA: لا استرداد لمشاكل المقاس أو تغيير الرأي؛ الاسترداد فقط للمنتجات التالفة أو المعيبة أو الخاطئة بعد التحقق. استبدال خلال 7 أيام."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
