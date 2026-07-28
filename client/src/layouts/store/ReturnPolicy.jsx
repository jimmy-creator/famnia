import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

function EnglishBody() {
  return (
    <>
      <p className="s2-static-date">Last updated: May 2026</p>

      <section className="s2-static-section">
        <h2>14-Day Returns, No Hassle</h2>
        <p>
          You have <strong>14 days</strong> from the date of delivery to return any unworn item for a refund or exchange. The item must be unworn, unwashed and still have its original tags attached.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. What We Accept</h2>
        <ul>
          <li>Unworn, unwashed garments with all original tags still attached.</li>
          <li>Items free of make-up marks, deodorant, perfume or other scents.</li>
          <li>Co-ord sets returned complete — both pieces together.</li>
          <li>Accessories, bags and shoes returned unused, with any dust bag or box they came in.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>2. What We Don't Accept</h2>
        <ul>
          <li>Items worn, washed, altered or with the tags removed.</li>
          <li>Pierced jewellery, and swimwear or intimates with the hygiene seal removed.</li>
          <li>Personalised, monogrammed or made-to-measure pieces.</li>
          <li>Sale or clearance items marked "Final Sale".</li>
          <li>Items past the 14-day window.</li>
          <li>Items damaged through wear, mishandling, or washing not per the care label.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. How to Return</h2>
        <ol>
          <li><strong>In-store</strong>: walk in to our store with the item and your receipt or order number. Refund or exchange on the spot.</li>
          <li><strong>By courier</strong>: contact us by email or WhatsApp with your order number. We'll share return instructions. For change-of-mind returns the customer covers return shipping; for damaged or wrong items we cover it.</li>
          <li><strong>Inspection</strong>: items are inspected before the refund is processed. If something fails the check (e.g. clear wear) we'll be in touch to discuss next steps.</li>
        </ol>
      </section>

      <section className="s2-static-section">
        <h2>4. Exchanges</h2>
        <p>
          Wrong size? Wrong colour? Bring it back within 14 days for an exchange, subject to stock availability.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>5. Damaged or Defective on Arrival</h2>
        <p>
          Report within <strong>7 days of receipt</strong> with photos. We arrange free pickup and offer a replacement, repair (where the manufacturer's warranty applies), or refund.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. Refund Timeline & Method</h2>
        <p>
          Refunds processed within <strong>5–10 business days</strong> of receiving the return, credited to the original payment method. See our <a href="/refund-policy">Refund Policy</a> for the full breakdown.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>7. Contact</h2>
        <p>
          <strong>Femnia Fashion</strong><br />
          📍 5C6J+JMG, Ar-Rayyan, Qatar<br />
          📧 <a href="mailto:info@femnia.com">info@femnia.com</a><br />
          📞 / WhatsApp: <a href="tel:+97466543343">+974 6654 3343</a>
        </p>
      </section>
    </>
  );
}

function ArabicBody() {
  return (
    <>
      <p className="s2-static-date">آخر تحديث: مايو 2026</p>

      <section className="s2-static-section">
        <h2>إرجاع خلال 14 يومًا بدون متاعب</h2>
        <p>
          لديك <strong>14 يومًا</strong> من تاريخ الشراء من المعرض أو التسليم لإرجاع أي قطعة غير ملبوسة لاسترداد المبلغ أو الاستبدال، بشرط أن تكون غير مغسولة وبطاقاتها الأصلية ما زالت مثبّتة.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. ما نقبله</h2>
        <ul>
          <li>القطع غير الملبوسة وغير المغسولة مع جميع بطاقاتها الأصلية.</li>
          <li>القطع الخالية من آثار المكياج أو مزيل العرق أو العطر أو أي روائح.</li>
          <li>الأطقم المتناسقة عند إرجاعها كاملة — بقطعتيها معًا.</li>
          <li>الإكسسوارات والحقائب والأحذية غير المستعمَلة، مع كيس الحفظ أو العلبة المرفقة.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>2. ما لا نقبله</h2>
        <ul>
          <li>القطع الملبوسة أو المغسولة أو المعدَّلة أو التي أُزيلت بطاقاتها.</li>
          <li>مجوهرات الثقب، وملابس السباحة أو الملابس الداخلية إذا أُزيل ختم النظافة.</li>
          <li>القطع المخصَّصة أو المطرَّزة بالأحرف أو المفصَّلة حسب المقاس.</li>
          <li>منتجات التخفيضات أو التصفية الموسومة بـ "بيع نهائي".</li>
          <li>المنتجات المُرجَعة بعد انتهاء مهلة 14 يومًا.</li>
          <li>القطع التالفة بسبب الاستعمال أو سوء المعاملة أو الغسل بخلاف تعليمات بطاقة العناية.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. كيف تتمّ عملية الإرجاع</h2>
        <ol>
          <li><strong>من المعرض</strong>: توجَّه إلى معرضنا مع المنتج وفاتورتك أو رقم طلبك. يتمّ استرداد المبلغ أو الاستبدال فورًا.</li>
          <li><strong>عن طريق الشحن</strong>: تواصل معنا بالبريد الإلكتروني أو واتساب مع رقم طلبك، وسنرسل لك تعليمات الإرجاع. في حالة الإرجاع بسبب تغيير الرأي يتحمّل العميل تكلفة الشحن العائد؛ أما في حالة المنتجات التالفة أو الخاطئة فنحن نتحمّلها.</li>
          <li><strong>الفحص</strong>: يتمّ فحص المنتجات قبل صرف الاسترداد. في حال لم يجتَز المنتج الفحص (مثلًا علامات استعمال واضحة)، سنتواصل معك لمناقشة الخيارات.</li>
        </ol>
      </section>

      <section className="s2-static-section">
        <h2>4. الاستبدال</h2>
        <p>
          مقاس خاطئ؟ لون خاطئ؟ أعِد المنتج خلال 14 يومًا لاستبداله، وذلك حسب توفر المخزون.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>5. التالف أو المعيب عند الاستلام</h2>
        <p>
          أبلِغنا خلال <strong>7 أيام من الاستلام</strong> مع الصور. سنرتّب استلامًا مجانيًا ونقدّم استبدالًا أو إصلاحًا (متى انطبق ضمان الشركة المصنّعة) أو استرداد المبلغ.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. مدة الاسترداد ووسيلة الدفع</h2>
        <p>
          تتم معالجة المبالغ المُسترَدة خلال <strong>5 إلى 10 أيام عمل</strong> من استلام المنتج المُرجَع، وتُعاد إلى وسيلة الدفع الأصلية. راجع <a href="/ar/refund-policy">سياسة استرداد المبالغ</a> للاطلاع على التفاصيل الكاملة.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>7. التواصل</h2>
        <p>
          <strong>Femnia Fashion</strong><br />
          📍 5C6J+JMG، الريان، قطر<br />
          📧 <a href="mailto:info@femnia.com">info@femnia.com</a><br />
          📞 / واتساب: <a href="tel:+97466543343">+974 6654 3343</a>
        </p>
      </section>
    </>
  );
}

export default function ReturnPolicy() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="Return Policy"
      titleAr="سياسة الإرجاع"
      description="Femnia Fashion return policy. 14-day returns on unworn items with tags attached, in-store and online."
      descriptionAr="سياسة الإرجاع لدى Femnia Fashion. إرجاع خلال 14 يومًا للقطع غير الملبوسة مع بطاقاتها الأصلية، في متجرنا وعبر الإنترنت."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
