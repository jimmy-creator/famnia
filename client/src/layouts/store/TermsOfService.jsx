import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

function EnglishBody() {
  return (
    <>
      <p className="s2-static-date">Last updated: May 2026</p>

      <section className="s2-static-section">
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing or using our website, or by placing an order with us, you agree to be bound by these Terms of Service. If you do not agree, please do not use our services.</p>
      </section>

      <section className="s2-static-section">
        <h2>2. About Us</h2>
        <p>
          The website and the brand <strong>Elegant Bayt</strong> are operated by <strong>Elegant Bayt</strong>. We are an online store selling quality products to customers across Qatar.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>3. Products &amp; Pricing</h2>
        <ul>
          <li>All prices are listed in Qatar Riyals (QAR) and are inclusive of VAT where applicable.</li>
          <li>Prices may change without prior notice. The price applicable to your order is the one shown at the time you place it.</li>
          <li>Product photography is illustrative; minor variation in colour and finish may occur between batches.</li>
          <li>We make every effort to display accurate stock, but errors may occasionally occur; we reserve the right to cancel and refund affected orders.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>4. Orders &amp; Payment</h2>
        <ul>
          <li>By placing an order, you confirm that the information you provide is accurate and complete.</li>
          <li>We may cancel or refuse any order at our discretion (e.g. pricing errors, stock issues, suspected fraud) and will refund any amount already paid.</li>
          <li>Online payments are processed securely via our payment gateway partners. We do not see or store your full card details.</li>
          <li>We accept major credit and debit cards, and Cash on Delivery where available.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>5. Authenticity</h2>
        <p>
          All branded products sold by Elegant Bayt are sourced through authorised channels and are 100% genuine. We do not deal in counterfeit, refurbished, or unauthorised parallel-imported goods.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. Returns &amp; Refunds</h2>
        <p>
          We offer 14-day returns on unused items in original packaging. Full details in our <a href="/return-policy">Return Policy</a> and <a href="/refund-policy">Refund Policy</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>7. Manufacturer Warranty</h2>
        <p>
          Where the manufacturer offers a warranty, claims are handled per the manufacturer's terms. Contact us with the item and proof of purchase and we will assist with the warranty process.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>8. User Accounts</h2>
        <p>
          You are responsible for keeping your login credentials confidential and for activity on your account. Please notify us at once if you suspect unauthorised access.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>9. Intellectual Property</h2>
        <p>All content on this website — including text, photography, logos, and design — is owned by Elegant Bayt or its licensors. Reproduction, redistribution, or commercial use without our written permission is prohibited. Third-party brand names and logos remain the property of their respective owners.</p>
      </section>

      <section className="s2-static-section">
        <h2>10. Limitation of Liability</h2>
        <p>To the fullest extent permitted by applicable law, Elegant Bayt shall not be liable for any indirect, incidental, or consequential loss arising from the use of our website or products. Our total liability for any direct loss is limited to the amount paid for the affected order.</p>
      </section>

      <section className="s2-static-section">
        <h2>11. Governing Law &amp; Jurisdiction</h2>
        <p>These terms are governed by the laws of the State of Qatar. Any disputes arising out of or in connection with these terms or your use of our services shall be subject to the exclusive jurisdiction of the courts of Qatar.</p>
      </section>

      <section className="s2-static-section">
        <h2>12. Changes to These Terms</h2>
        <p>We may update these terms from time to time. The latest version will always be available on this page with the date above. Continued use of our website after changes constitutes acceptance.</p>
      </section>

      <section className="s2-static-section">
        <h2>13. Contact</h2>
        <p>For any questions regarding these terms or our services:</p>
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
        <h2>1. قبول الشروط</h2>
        <p>بدخولك إلى موقعنا أو استخدامه، أو إجرائك طلبًا لدينا، فإنك توافق على الالتزام بشروط الخدمة هذه. إذا لم توافق عليها، يُرجى عدم استخدام خدماتنا.</p>
      </section>

      <section className="s2-static-section">
        <h2>2. من نحن</h2>
        <p>
          هذا الموقع وعلامة <strong>Elegant Bayt</strong> تديرهما <strong>Elegant Bayt</strong>. نحن متجر إلكتروني يبيع منتجات عالية الجودة لعملائنا في دولة قطر.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>3. المنتجات والأسعار</h2>
        <ul>
          <li>جميع الأسعار بالريال القطري (QAR) وشاملة لضريبة القيمة المضافة حيثما انطبق.</li>
          <li>قد تتغيّر الأسعار دون إشعار مسبق. السعر المطبَّق على طلبك هو السعر المعروض وقت تقديمه.</li>
          <li>صور المنتجات للتوضيح؛ وقد يحدث اختلاف بسيط في اللون أو اللمسة النهائية بين الدفعات.</li>
          <li>نبذل قصارى جهدنا لعرض المخزون بدقّة، لكن قد تحدث أخطاء في بعض الأحيان؛ ونحتفظ بالحق في إلغاء الطلبات المتأثّرة واسترداد المبالغ.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>4. الطلبات والدفع</h2>
        <ul>
          <li>بإتمامك أي طلب، فإنك تؤكّد أن المعلومات التي قدّمتها صحيحة وكاملة.</li>
          <li>يحقّ لنا إلغاء أو رفض أي طلب وفقًا لتقديرنا (مثل: أخطاء التسعير، مشكلات المخزون، الاشتباه بالاحتيال) وسنقوم باسترداد أي مبلغ مدفوع.</li>
          <li>تتمّ معالجة الدفع الإلكتروني بشكل آمن عبر شركاء بوابات الدفع لدينا. لا نطّلع على بيانات بطاقتك الكاملة ولا نخزّنها.</li>
          <li>نقبل بطاقات الائتمان والخصم الرئيسية، والدفع عند الاستلام حيثما توفّر.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>5. الأصالة</h2>
        <p>
          جميع المنتجات الموسومة بعلامات تجارية والتي يبيعها Elegant Bayt مصدرها قنوات معتمدة وأصلية 100%. لا نتعامل في منتجات مقلَّدة أو مُجدَّدة أو مستوردة بشكل غير رسمي.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. الإرجاع والاسترداد</h2>
        <p>
          نوفّر إمكانية الإرجاع خلال 14 يومًا للمنتجات غير المستعمَلة في تغليفها الأصلي. التفاصيل الكاملة في <a href="/ar/return-policy">سياسة الإرجاع</a> و<a href="/ar/refund-policy">سياسة استرداد المبالغ</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>7. ضمان الشركة المصنّعة</h2>
        <p>
          عند وجود ضمان من الشركة المصنّعة، تُعالَج المطالبات وفق شروط الشركة المصنّعة. تواصل معنا مع المنتج وإثبات الشراء وسنساعدك في إتمام إجراءات الضمان.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>8. حسابات المستخدمين</h2>
        <p>
          أنت مسؤول عن الحفاظ على سرّية بيانات تسجيل دخولك وعن جميع الأنشطة التي تتمّ عبر حسابك. يرجى إبلاغنا فورًا في حال الاشتباه بأي وصول غير مصرَّح به.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>9. الملكية الفكرية</h2>
        <p>جميع المحتويات على هذا الموقع — بما في ذلك النصوص والصور والشعارات والتصميم — مملوكة لـ Elegant Bayt أو الجهات المُرخِّصة لها. يُحظَر النسخ أو إعادة التوزيع أو الاستخدام التجاري دون إذن خطّي منّا. تبقى أسماء وشعارات العلامات التجارية لأطراف ثالثة ملكًا لأصحابها.</p>
      </section>

      <section className="s2-static-section">
        <h2>10. تحديد المسؤولية</h2>
        <p>إلى أقصى حد يسمح به القانون المعمول به، لن تكون Elegant Bayt مسؤولة عن أي خسائر غير مباشرة أو عرضية أو تبعية ناتجة عن استخدام موقعنا أو منتجاتنا. مسؤوليتنا الإجمالية عن أي خسارة مباشرة تقتصر على المبلغ المدفوع للطلب المتأثّر.</p>
      </section>

      <section className="s2-static-section">
        <h2>11. القانون الحاكم والاختصاص القضائي</h2>
        <p>تخضع هذه الشروط لقوانين دولة قطر. وتخضع أي نزاعات تنشأ عن هذه الشروط أو تتعلق بها أو باستخدامك لخدماتنا للاختصاص القضائي الحصري لمحاكم دولة قطر.</p>
      </section>

      <section className="s2-static-section">
        <h2>12. التعديلات على هذه الشروط</h2>
        <p>قد نقوم بتحديث هذه الشروط من وقت لآخر. ستكون أحدث نسخة متاحة دائمًا على هذه الصفحة مع التاريخ أعلاه. استمرارك في استخدام موقعنا بعد التحديث يُعدّ موافقةً عليه.</p>
      </section>

      <section className="s2-static-section">
        <h2>13. التواصل</h2>
        <p>لأي استفسارات تتعلق بهذه الشروط أو خدماتنا:</p>
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

export default function TermsOfService() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="Terms of Service"
      titleAr="شروط الخدمة"
      description="Terms and conditions for using the Elegant Bayt website and services."
      descriptionAr="الشروط والأحكام لاستخدام موقع Elegant Bayt وخدماتنا."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
