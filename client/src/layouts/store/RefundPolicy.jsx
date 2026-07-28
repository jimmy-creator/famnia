import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

function EnglishBody() {
  return (
    <>
      <p className="s2-static-date">Last updated: May 2026</p>

      <section className="s2-static-section">
        <h2>Our Position</h2>
        <p>
          We want you to be happy with what you bought. If the size doesn't fit, the colour isn't quite right, or you simply changed your mind — bring it back within <strong>14 days</strong> in original condition and we'll refund or exchange it.
        </p>
        <p>
          Anything that arrived damaged, wrong or defective is on us — report within 7 days with photos and we'll cover the cost of resolution.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. Refund-Eligible Returns</h2>
        <ul>
          <li><strong>Unused, unworn, in original packaging</strong> with all tags, labels and accessories attached.</li>
          <li>Returned within <strong>14 days</strong> of in-store purchase or delivery.</li>
          <li>Proof of purchase: original receipt or order number.</li>
          <li>For online orders, the original courier packaging should be intact where possible.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>2. Non-Refundable Items</h2>
        <ul>
          <li>Items that have been used, or that show signs of use.</li>
          <li>Items returned without their original packaging, labels, or included accessories.</li>
          <li>Items returned after the return window has expired.</li>
          <li>Customised or made-to-order items.</li>
          <li>Gift cards.</li>
          <li>Sale or clearance items marked "Final Sale".</li>
          <li>Items damaged through misuse, improper handling, or normal wear and tear.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. Damaged, Wrong or Defective</h2>
        <p>
          Contact us within <strong>7 days of receipt</strong> with your order number and clear photos. We will arrange a free pickup and either replace, repair under warranty (manufacturer-permitting), or refund — your choice.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>4. How Refunds Are Issued</h2>
        <ul>
          <li>Refunds are processed within <strong>5–10 business days</strong> after we receive and inspect the returned item.</li>
          <li>Credited back to the <strong>original payment method</strong> (card via Tap Payments, etc.).</li>
          <li>Cash purchases made in-store are refunded by cash or store credit at our store.</li>
          <li>The original delivery charge is non-refundable unless the return is due to our error.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>5. In-Store vs Online Purchases</h2>
        <p>
          You may return online orders to our store or by courier (return shipping at customer cost for change-of-mind returns). In-store purchases are returned in-store.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. Contact</h2>
        <p>
          <strong>Elegant Bayt</strong><br />
          📍 5C6J+JMG, Ar-Rayyan, Qatar<br />
          📧 <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a><br />
          📞 / WhatsApp: <a href="tel:+97470338065">+974 7033 8065</a>
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
        <h2>موقفنا</h2>
        <p>
          نريدك أن تكون راضيًا عمّا اشتريته. إذا لم يناسبك المقاس أو اللون، أو غيّرت رأيك ببساطة — أعِد المنتج خلال <strong>14 يومًا</strong> بحالته الأصلية وسنقوم باسترداد المبلغ أو الاستبدال.
        </p>
        <p>
          أي منتج وصل تالفًا أو خطأً أو معيبًا فهو على عاتقنا — أبلِغنا خلال 7 أيام مع صور، وسنتحمل تكلفة الحلّ.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. الإرجاعات المؤهَّلة لاسترداد المبلغ</h2>
        <ul>
          <li><strong>غير مستعمل، لم يُرتدَ، وفي تغليفه الأصلي</strong> مع جميع البطاقات والملصقات والملحقات.</li>
          <li>الإرجاع خلال <strong>14 يومًا</strong> من تاريخ الشراء من المعرض أو التسليم.</li>
          <li>إثبات الشراء: الفاتورة الأصلية أو رقم الطلب.</li>
          <li>للطلبات الإلكترونية، يُفضَّل أن يكون التغليف الأصلي للشحن سليمًا قدر الإمكان.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>2. منتجات غير قابلة للاسترداد</h2>
        <ul>
          <li>المنتجات التي استُخدمت أو تظهر عليها آثار الاستخدام.</li>
          <li>المنتجات المُعادة دون تغليفها الأصلي أو ملصقاتها أو ملحقاتها المرفقة.</li>
          <li>المنتجات المُعادة بعد انتهاء مدة الإرجاع.</li>
          <li>المنتجات المخصَّصة أو المصنوعة حسب الطلب.</li>
          <li>بطاقات الهدايا.</li>
          <li>منتجات التخفيضات أو التصفية الموسومة بـ "بيع نهائي".</li>
          <li>المنتجات التالفة بسبب سوء الاستخدام أو التعامل غير السليم أو الاستهلاك الطبيعي.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. المنتجات التالفة أو الخاطئة أو المعيبة</h2>
        <p>
          تواصل معنا خلال <strong>7 أيام من الاستلام</strong> مع رقم طلبك وصور واضحة. سنرتّب استلامًا مجانيًا ونوفّر استبدالًا أو إصلاحًا بموجب الضمان (وفق ما تسمح به الشركة المصنّعة)، أو استرداد المبلغ — حسب اختيارك.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>4. كيف يتمّ استرداد المبلغ</h2>
        <ul>
          <li>تتمّ معالجة استرداد المبلغ خلال <strong>5 إلى 10 أيام عمل</strong> بعد استلامنا للمنتج المُرجَع وفحصه.</li>
          <li>يُعاد المبلغ إلى <strong>وسيلة الدفع الأصلية</strong> (بطاقة عبر Tap Payments، إلخ).</li>
          <li>المشتريات النقدية داخل المعرض تُسترَد نقدًا أو رصيدًا داخل المعرض.</li>
          <li>رسوم التوصيل الأصلية غير قابلة للاسترداد ما لم يكن الإرجاع بسبب خطأ من جانبنا.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>5. المشتريات من المعرض مقابل المشتريات الإلكترونية</h2>
        <p>
          يمكنك إعادة الطلبات الإلكترونية إلى معرضنا أو عبر شركة الشحن (تتحمّل تكلفة الشحن في حال الإرجاع بسبب تغيير الرأي). أما مشتريات المعرض فتُعاد إلى المعرض.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. التواصل</h2>
        <p>
          <strong>Elegant Bayt</strong><br />
          📍 5C6J+JMG، الريان، قطر<br />
          📧 <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a><br />
          📞 / واتساب: <a href="tel:+97470338065">+974 7033 8065</a>
        </p>
      </section>
    </>
  );
}

export default function RefundPolicy() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="Refund Policy"
      titleAr="سياسة استرداد المبالغ"
      description="Elegant Bayt refund policy. Returns accepted within 14 days on unused items in original packaging."
      descriptionAr="سياسة استرداد المبالغ لدى Elegant Bayt. نقبل الإرجاع خلال 14 يومًا للمنتجات غير المستعملة في تغليفها الأصلي."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
