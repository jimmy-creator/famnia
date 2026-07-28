import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

function EnglishBody() {
  return (
    <>
      <p className="s2-static-date">Last updated: May 2026</p>

      <section className="s2-static-section">
        <h2>Where We Deliver</h2>
        <p>
          We deliver across Qatar. Within Doha we can usually arrange same-day or next-day delivery; other areas take a day or two longer.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. Processing Time</h2>
        <p>
          Online orders placed before 4 PM on a working day are typically dispatched the same day. Orders placed later, on weekends, or on public holidays go out on the next working day.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>2. Delivery Timeframes</h2>
        <table className="s2-static-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Estimated Delivery</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Doha</td><td>Same day – 1 business day</td></tr>
            <tr><td>Al Rayyan, Al Wakrah, Lusail, Umm Salal</td><td>1–2 business days</td></tr>
            <tr><td>Al Khor, Al Daayen, Mesaieed, Al Shamal</td><td>2–3 business days</td></tr>
          </tbody>
        </table>
      </section>

      <section className="s2-static-section">
        <h2>3. Shipping Charges</h2>
        <ul>
          <li><strong>Free home delivery</strong> on orders above the minimum order value (shown at checkout).</li>
          <li>Flat delivery fee for orders below the threshold; exact amount shown at checkout.</li>
          <li>Cash on Delivery may carry a small handling fee.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>4. Click &amp; Collect</h2>
        <p>
          Order online and pick up from our store in Ar-Rayyan, Qatar within 1–2 hours of dispatch confirmation, free of charge. You'll receive an SMS / email when it's ready.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>5. Order Tracking</h2>
        <p>
          Once your order is shipped, you'll receive a confirmation with tracking information. You can also view live status under <strong>My Orders</strong> on our website.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. Failed Delivery</h2>
        <p>
          If the courier can't reach you, they'll attempt redelivery for up to 2 more days. After repeated failed attempts the parcel returns to us — we'll contact you to either reship (additional fee may apply) or refund per our <a href="/refund-policy">Refund Policy</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>7. Damaged in Transit</h2>
        <p>
          If your parcel arrives with visible damage to the carton or product, take photos and contact us within <strong>7 days of delivery</strong>. Full details in our <a href="/return-policy">Return Policy</a> and <a href="/refund-policy">Refund Policy</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>8. International Shipping</h2>
        <p>
          We currently ship within Qatar only. For GCC or international orders, drop us a line and we can arrange on a case-by-case basis.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>9. Contact</h2>
        <p>
          📞 / WhatsApp: <a href="tel:+97470338065">+974 7033 8065</a><br />
          📧 <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a>
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
        <h2>أين نوصِّل</h2>
        <p>
          نقوم بالتوصيل في جميع أنحاء دولة قطر. داخل الدوحة يمكننا عادةً ترتيب التوصيل في نفس اليوم أو اليوم التالي؛ أما المناطق الأخرى فتستغرق يومًا أو يومين إضافيَّين.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. مدة التجهيز</h2>
        <p>
          الطلبات الإلكترونية التي تتمّ قبل الساعة 4 عصرًا في أي يوم عمل تُشحَن عادةً في نفس اليوم. أما الطلبات التي تتمّ بعد ذلك، أو في عطلات نهاية الأسبوع، أو في العطلات الرسمية، فتُشحَن في يوم العمل التالي.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>2. مواعيد التوصيل</h2>
        <table className="s2-static-table">
          <thead>
            <tr>
              <th>المنطقة</th>
              <th>مدة التوصيل التقديرية</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>الدوحة</td><td>نفس اليوم – يوم عمل واحد</td></tr>
            <tr><td>الريان، الوكرة، لوسيل، أم صلال</td><td>1–2 يوم عمل</td></tr>
            <tr><td>الخور، الظعاين، مسيعيد، الشمال</td><td>2–3 أيام عمل</td></tr>
          </tbody>
        </table>
      </section>

      <section className="s2-static-section">
        <h2>3. رسوم التوصيل</h2>
        <ul>
          <li><strong>توصيل مجاني</strong> للطلبات التي تتجاوز الحد الأدنى لقيمة الطلب (يظهر عند الدفع).</li>
          <li>رسوم توصيل ثابتة للطلبات التي تقلّ عن الحد الأدنى؛ المبلغ المحدّد يظهر عند الدفع.</li>
          <li>قد تخضع الدفع عند الاستلام لرسوم إضافية بسيطة.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>4. الطلب والاستلام من المتجر</h2>
        <p>
          اطلب عبر الإنترنت واستلم من متجرنا في الريان، قطر خلال 1–2 ساعة من تأكيد التجهيز، دون أي رسوم. ستصلك رسالة نصية / بريد إلكتروني عندما يكون الطلب جاهزًا.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>5. تتبّع الطلب</h2>
        <p>
          بمجرّد شحن طلبك، ستصلك رسالة تأكيد تتضمّن بيانات التتبّع. كما يمكنك الاطلاع على الحالة المباشرة من <strong>طلباتي</strong> على موقعنا.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. فشل التوصيل</h2>
        <p>
          إذا تعذّر على شركة الشحن الوصول إليك، فستحاول إعادة التوصيل لمدة تصل إلى يومين إضافيَّين. وبعد تكرار محاولات التوصيل الفاشلة يعود الطرد إلينا — وسنتواصل معك إما لإعادة الشحن (قد تنطبق رسوم إضافية) أو لاسترداد المبلغ وفقًا لـ <a href="/ar/refund-policy">سياسة استرداد المبالغ</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>7. التلف أثناء النقل</h2>
        <p>
          إذا وصل طردك بضرر ظاهر في العلبة أو المنتج، التقط صورًا وتواصل معنا خلال <strong>7 أيام من التسليم</strong>. التفاصيل الكاملة في <a href="/ar/return-policy">سياسة الإرجاع</a> و<a href="/ar/refund-policy">سياسة استرداد المبالغ</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>8. الشحن الدولي</h2>
        <p>
          نقوم حاليًا بالشحن داخل دولة قطر فقط. للطلبات الخليجية أو الدولية، يرجى التواصل معنا وسنرتّبها وفق كل حالة.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>9. التواصل</h2>
        <p>
          📞 / واتساب: <a href="tel:+97470338065">+974 7033 8065</a><br />
          📧 <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a>
        </p>
      </section>
    </>
  );
}

export default function ShippingPolicy() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="Shipping Policy"
      titleAr="سياسة الشحن"
      description="Elegant Bayt delivery across Qatar. Free over a minimum order, fast delivery to most areas."
      descriptionAr="توصيل Elegant Bayt في جميع أنحاء قطر. توصيل مجاني فوق الحد الأدنى للطلب، وتوصيل سريع لمعظم المناطق."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
