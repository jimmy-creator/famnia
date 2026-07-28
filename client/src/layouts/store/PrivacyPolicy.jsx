import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

function EnglishBody() {
  return (
    <>
      <p className="s2-static-date">Last updated: May 2026</p>

      <section className="s2-static-section">
        <h2>1. Who We Are</h2>
        <p>
          This Privacy Policy is issued by <strong>Elegant Bayt</strong>, operating the brand <strong>Elegant Bayt</strong>, with its registered office at 5C6J+JMG, Ar-Rayyan, Qatar ("Elegant Bayt", "we", "us"). It explains how we collect and handle personal information when you visit our website or place an order with us.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>2. Information We Collect</h2>
        <ul>
          <li><strong>Account & contact details:</strong> Name, email address, phone number, and shipping address you provide at checkout, signup, or when raising a wholesale request.</li>
          <li><strong>Order information:</strong> Items purchased, order amount, delivery address.</li>
          <li><strong>Payment data:</strong> Processed by our payment gateway partners. We do not see or store your full card details.</li>
          <li><strong>Device & usage data:</strong> Browser type, IP address, pages visited, and basic analytics — collected automatically to keep the site working and improve it.</li>
          <li><strong>Communications:</strong> Messages you send via our contact form, WhatsApp, or email.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. How We Use Your Information</h2>
        <ul>
          <li>To process and fulfil your orders and B2B/wholesale quotes.</li>
          <li>To send order confirmations, shipping updates, invoices, and quote emails.</li>
          <li>To respond to your enquiries and provide customer support.</li>
          <li>To send promotional emails only where you have opted in.</li>
          <li>To improve our website, packaging, and product range.</li>
          <li>To comply with applicable Qatar laws and respond to lawful requests.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>4. Data Sharing</h2>
        <p>We do not sell or rent your personal data. We share it only with:</p>
        <ul>
          <li><strong>Payment processors:</strong> Our payment gateway partners, for secure payment handling.</li>
          <li><strong>Logistics partners:</strong> Courier and shipping providers that deliver your order.</li>
          <li><strong>Service providers:</strong> Email, hosting, and analytics vendors operating on our behalf under appropriate confidentiality terms.</li>
          <li><strong>Legal authorities:</strong> When required by Qatar law, court order, or to protect our rights.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>5. Data Retention</h2>
        <p>
          We retain your personal data only for as long as needed to provide our services, comply with tax and accounting obligations under Qatar law, and resolve disputes. You may request deletion of your account and associated data at any time by emailing us at <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. Cookies</h2>
        <p>Our website uses cookies and similar technologies to keep you signed in, remember your cart, and measure basic site traffic. You can disable cookies in your browser settings, but some features (cart, checkout, account) may stop working.</p>
      </section>

      <section className="s2-static-section">
        <h2>7. Your Rights</h2>
        <p>
          Subject to Qatar law (including the applicable data protection law), you have the right to access, correct, or delete the personal data we hold about you, and to withdraw consent at any time. To exercise these rights, write to <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>8. Children</h2>
        <p>Our website is not directed at children under 18. We do not knowingly collect personal data from minors.</p>
      </section>

      <section className="s2-static-section">
        <h2>9. Changes to This Policy</h2>
        <p>We may update this policy from time to time. Material changes will be highlighted on this page and dated above. Continued use of our website after changes constitutes acceptance.</p>
      </section>

      <section className="s2-static-section">
        <h2>10. Contact / Grievance Officer</h2>
        <p>For any privacy-related questions or to raise a grievance:</p>
        <p>
          <strong>Elegant Bayt</strong><br />
          5C6J+JMG<br />
          Ar-Rayyan, Qatar<br />
          Email: <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a><br />
          Phone / WhatsApp: <a href="tel:+97470338065">+974 7033 8065</a>
        </p>
        <p>We will acknowledge complaints within 24 hours and aim to resolve them within 15 days, in line with applicable Qatar regulations.</p>
      </section>
    </>
  );
}

function ArabicBody() {
  return (
    <>
      <p className="s2-static-date">آخر تحديث: مايو 2026</p>

      <section className="s2-static-section">
        <h2>1. من نحن</h2>
        <p>
          صادرة هذه السياسة عن <strong>Elegant Bayt</strong>، المالكة لعلامة <strong>Elegant Bayt</strong>، ومقرّها المسجَّل في 5C6J+JMG، الريان، قطر ("Elegant Bayt"، "نحن"، "لدينا"). توضّح هذه السياسة كيف نقوم بجمع ومعالجة المعلومات الشخصية عند زيارتك لموقعنا الإلكتروني أو إجراء طلب لدينا.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>2. المعلومات التي نجمعها</h2>
        <ul>
          <li><strong>بيانات الحساب والتواصل:</strong> الاسم، البريد الإلكتروني، رقم الهاتف، وعنوان التوصيل التي تقدّمها عند الدفع أو التسجيل أو عند تقديم طلب جملة.</li>
          <li><strong>معلومات الطلب:</strong> المنتجات المُشتراة، قيمة الطلب، وعنوان التوصيل.</li>
          <li><strong>بيانات الدفع:</strong> تُعالَج عن طريق شركاء بوابات الدفع لدينا. لا نطّلع على بيانات بطاقتك الكاملة ولا نخزّنها.</li>
          <li><strong>بيانات الجهاز والاستخدام:</strong> نوع المتصفح، عنوان IP، الصفحات التي تتم زيارتها، وبيانات تحليلية أساسية — تُجمَع تلقائيًا لتشغيل الموقع وتحسينه.</li>
          <li><strong>المراسلات:</strong> الرسائل التي ترسلها عبر نموذج التواصل، واتساب، أو البريد الإلكتروني.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. كيف نستخدم معلوماتك</h2>
        <ul>
          <li>لمعالجة طلباتك وتنفيذ عروض البيع بالجملة (B2B).</li>
          <li>لإرسال تأكيدات الطلب، تحديثات الشحن، الفواتير، ورسائل عروض الأسعار.</li>
          <li>للرد على استفساراتك وتقديم خدمة العملاء.</li>
          <li>لإرسال رسائل ترويجية فقط في حال موافقتك المسبقة.</li>
          <li>لتحسين موقعنا، تغليفنا، وتشكيلة منتجاتنا.</li>
          <li>للامتثال للقوانين القطرية المعمول بها والاستجابة للطلبات القانونية.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>4. مشاركة البيانات</h2>
        <p>لا نبيع بياناتك الشخصية أو نؤجّرها. نشاركها فقط مع:</p>
        <ul>
          <li><strong>معالِجات الدفع:</strong> شركاء بوابات الدفع لدينا لمعالجة الدفع بشكل آمن.</li>
          <li><strong>شركاء التوصيل:</strong> شركات الشحن والتوصيل التي توصِّل طلبك.</li>
          <li><strong>مزوّدو الخدمات:</strong> مزوّدو البريد والاستضافة والتحليلات الذين يعملون نيابةً عنّا وفق التزامات سرّية مناسبة.</li>
          <li><strong>الجهات القانونية:</strong> عند الاقتضاء بموجب القانون القطري أو أمر قضائي أو لحماية حقوقنا.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>5. الاحتفاظ بالبيانات</h2>
        <p>
          نحتفظ ببياناتك الشخصية فقط طوال الفترة اللازمة لتقديم خدماتنا، والامتثال للالتزامات الضريبية والمحاسبية بموجب القانون القطري، ولحل النزاعات. يمكنك طلب حذف حسابك والبيانات المرتبطة به في أي وقت بمراسلتنا على <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>6. ملفات تعريف الارتباط (الكوكيز)</h2>
        <p>يستخدم موقعنا ملفات تعريف الارتباط وتقنيات مشابهة للحفاظ على تسجيل دخولك، وتذكُّر سلتك، وقياس حركة المرور الأساسية. يمكنك تعطيل ملفات تعريف الارتباط من إعدادات متصفحك، ولكن بعض الميزات (السلة، الدفع، الحساب) قد تتوقف عن العمل.</p>
      </section>

      <section className="s2-static-section">
        <h2>7. حقوقك</h2>
        <p>
          مع مراعاة القانون القطري (بما في ذلك قانون حماية البيانات المعمول به متى انطبق)، يحقّ لك الوصول إلى بياناتك الشخصية لدينا أو تصحيحها أو حذفها، وسحب موافقتك في أي وقت. لممارسة هذه الحقوق، يرجى المراسلة على <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a>.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>8. الأطفال</h2>
        <p>موقعنا غير موجَّه للأطفال دون سن 18 عامًا. ولا نقوم عن علم بجمع بيانات شخصية من القاصرين.</p>
      </section>

      <section className="s2-static-section">
        <h2>9. تعديلات على هذه السياسة</h2>
        <p>قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم إبراز التغييرات الجوهرية على هذه الصفحة مع تاريخها أعلاه. استمرارك في استخدام موقعنا بعد التحديث يُعدّ موافقةً عليه.</p>
      </section>

      <section className="s2-static-section">
        <h2>10. التواصل / مسؤول الشكاوى</h2>
        <p>لأي أسئلة تتعلق بالخصوصية أو لتقديم شكوى:</p>
        <p>
          <strong>Elegant Bayt</strong><br />
          محل رقم 03، مبنى رقم 3360، المنطقة الصناعية 17<br />
          الريان، قطر<br />
          البريد الإلكتروني: <a href="mailto:info@elegantbayt.com">info@elegantbayt.com</a><br />
          الهاتف / واتساب: <a href="tel:+97470338065">+974 7033 8065</a>
        </p>
        <p>سنُقرّ باستلام الشكاوى خلال 24 ساعة ونسعى إلى حلّها خلال 15 يومًا، وفقًا للأنظمة القطرية المعمول بها.</p>
      </section>
    </>
  );
}

export default function PrivacyPolicy() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="Privacy Policy"
      titleAr="سياسة الخصوصية"
      description="Privacy Policy for Elegant Bayt. How we collect, use, and protect your personal information."
      descriptionAr="سياسة الخصوصية لـ Elegant Bayt. كيف نقوم بجمع معلوماتك الشخصية واستخدامها وحمايتها."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
