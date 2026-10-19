import { useTranslation } from 'react-i18next';
import StaticPage from './StaticPage';

const WHATSAPP_URL = 'https://wa.me/97466543343';

export function EnglishBody() {
  return (
    <>
      <p className="s2-static-date">Last updated: October 2026</p>

      <section className="s2-static-section">
        <p>
          At FEMNIA, customer satisfaction is our priority. Please read our Return &amp; Exchange Policy carefully before placing your order.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. Exchange Policy</h2>
        <ul>
          <li><strong>7-Day Exchange:</strong> Customers can request an exchange within 7 days of receiving their order.</li>
          <li><strong>Size Issues:</strong> Exchanges are available for size-related issues, subject to product availability.</li>
          <li><strong>Pickup Charges:</strong> Additional pickup charges may apply if FEMNIA arranges to collect the product for an exchange.</li>
          <li><strong>No Refunds for Size Issues:</strong> Refunds are not available for size-related issues or change-of-mind requests.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>2. Product Condition for Exchanges</h2>
        <p>To be eligible for an exchange, the product must meet the following conditions:</p>
        <ul>
          <li>The product must be unused and unwashed.</li>
          <li>All original product tags and barcodes must remain attached and intact.</li>
          <li>Products with removed, detached, or damaged tags or barcodes are not eligible for exchange.</li>
          <li>The product must be returned in its original condition, without damage caused by use, washing, or handling.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. Damaged or Incorrect Products</h2>
        <p>
          If you receive a damaged, defective, or incorrect product, please contact us through <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a> as soon as possible.
        </p>
        <ul>
          <li><strong>Proof Required:</strong> You must send clear photos or videos showing the damage, defect, or incorrect product.</li>
          <li><strong>Tags and Barcodes:</strong> Original tags and barcodes must not be removed or tampered with. If the product arrives with damage or defects, please keep all tags and packaging intact until our team reviews your complaint.</li>
          <li><strong>Verification:</strong> Our team will review the evidence before approving a refund or exchange.</li>
          <li><strong>Resolution Time:</strong> Once the issue and supporting evidence are verified, FEMNIA will arrange an eligible refund or exchange within 3–4 days.</li>
        </ul>
        <p>Please do not wash, use, or remove the tags from a product you believe is damaged or incorrect before contacting us.</p>
      </section>

      <section className="s2-static-section">
        <h2>4. Refund Policy</h2>
        <p>FEMNIA does not offer refunds for general returns, size issues, or change-of-mind requests.</p>
        <p>Refunds will only be considered for verified cases involving damaged, defective, or incorrect products, subject to our review and approval.</p>
      </section>

      <section className="s2-static-section">
        <h2>5. How to Request an Exchange or Refund</h2>
        <p>To request an exchange or report a damaged or incorrect product:</p>
        <ol>
          <li>Contact us through our official <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp support</a>.</li>
          <li>Provide your order number and purchase details.</li>
          <li>Send clear photos or videos of the product as proof, where applicable.</li>
          <li>Keep the product unused and unwashed, with all original tags and barcodes intact.</li>
          <li>Wait for our team to review your request and provide further instructions.</li>
        </ol>
      </section>

      <section className="s2-static-section">
        <h2>6. Important Conditions</h2>
        <ul>
          <li>Exchange requests must be made within 7 days of receiving the order.</li>
          <li>Exchanges are subject to product availability.</li>
          <li>Pickup charges may apply to exchanges.</li>
          <li>Products that have been used, washed, or returned without their original tags and barcodes may not qualify for an exchange.</li>
          <li>Damaged or incorrect products must be reported promptly, with clear supporting evidence.</li>
          <li>Refunds and exchanges for damaged, defective, or incorrect products are subject to verification and approval.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>7. Contact Us</h2>
        <p>
          For exchange requests, refund inquiries, or product-related concerns, please contact FEMNIA through our official WhatsApp support.
        </p>
        <p>
          📞 / WhatsApp: <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">+974 6654 3343</a>
        </p>
        <p><strong>FEMNIA – Elegant | Comfort | Affordable</strong></p>
        <p>Thank you for shopping with FEMNIA!</p>
      </section>
    </>
  );
}

export function ArabicBody() {
  return (
    <>
      <p className="s2-static-date">آخر تحديث: أكتوبر 2026</p>

      <section className="s2-static-section">
        <p>
          في FEMNIA، رضا عملائنا هو أولويتنا. يُرجى قراءة سياسة الإرجاع والاستبدال بعناية قبل تقديم طلبك.
        </p>
      </section>

      <section className="s2-static-section">
        <h2>1. سياسة الاستبدال</h2>
        <ul>
          <li><strong>استبدال خلال 7 أيام:</strong> يمكن للعملاء طلب الاستبدال خلال 7 أيام من استلام الطلب.</li>
          <li><strong>مشاكل المقاس:</strong> الاستبدال متاح لمشاكل المقاس، وذلك حسب توفر المنتج.</li>
          <li><strong>رسوم الاستلام:</strong> قد تُطبَّق رسوم استلام إضافية إذا رتّبت FEMNIA استلام المنتج لاستبداله.</li>
          <li><strong>لا استرداد لمشاكل المقاس:</strong> لا يتوفر استرداد المبلغ لمشاكل المقاس أو لتغيير الرأي.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>2. حالة المنتج للاستبدال</h2>
        <p>ليكون المنتج مؤهلًا للاستبدال، يجب أن يستوفي الشروط التالية:</p>
        <ul>
          <li>أن يكون المنتج غير مستعمل وغير مغسول.</li>
          <li>أن تبقى جميع البطاقات والباركودات الأصلية مثبّتة وسليمة.</li>
          <li>المنتجات التي أُزيلت أو فُصلت أو تلفت بطاقاتها أو باركوداتها غير مؤهلة للاستبدال.</li>
          <li>يجب إرجاع المنتج بحالته الأصلية، دون أضرار ناتجة عن الاستعمال أو الغسل أو التعامل.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>3. المنتجات التالفة أو الخاطئة</h2>
        <p>
          إذا استلمت منتجًا تالفًا أو معيبًا أو خاطئًا، يُرجى التواصل معنا عبر <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">واتساب</a> في أقرب وقت ممكن.
        </p>
        <ul>
          <li><strong>الإثبات مطلوب:</strong> يجب إرسال صور أو مقاطع فيديو واضحة تُظهر التلف أو العيب أو المنتج الخاطئ.</li>
          <li><strong>البطاقات والباركودات:</strong> يجب عدم إزالة البطاقات والباركودات الأصلية أو العبث بها. إذا وصل المنتج تالفًا أو معيبًا، يُرجى الإبقاء على جميع البطاقات والتغليف سليمة حتى يراجع فريقنا شكواك.</li>
          <li><strong>التحقق:</strong> سيراجع فريقنا الإثباتات قبل الموافقة على الاسترداد أو الاستبدال.</li>
          <li><strong>مدة الحل:</strong> بعد التحقق من المشكلة والإثباتات، ستُرتّب FEMNIA الاسترداد أو الاستبدال المستحق خلال 3–4 أيام.</li>
        </ul>
        <p>يُرجى عدم غسل المنتج الذي تعتقد أنه تالف أو خاطئ أو استعماله أو إزالة بطاقاته قبل التواصل معنا.</p>
      </section>

      <section className="s2-static-section">
        <h2>4. سياسة استرداد المبالغ</h2>
        <p>لا تقدّم FEMNIA استرداد المبالغ للإرجاع العام أو لمشاكل المقاس أو لتغيير الرأي.</p>
        <p>يُنظر في استرداد المبالغ فقط في الحالات المُتحقَّق منها للمنتجات التالفة أو المعيبة أو الخاطئة، وذلك بعد مراجعتنا وموافقتنا.</p>
      </section>

      <section className="s2-static-section">
        <h2>5. كيفية طلب الاستبدال أو الاسترداد</h2>
        <p>لطلب الاستبدال أو الإبلاغ عن منتج تالف أو خاطئ:</p>
        <ol>
          <li>تواصل معنا عبر <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">دعم واتساب الرسمي</a>.</li>
          <li>أرسل رقم طلبك وتفاصيل الشراء.</li>
          <li>أرسل صورًا أو مقاطع فيديو واضحة للمنتج كإثبات، عند الحاجة.</li>
          <li>أبقِ المنتج غير مستعمل وغير مغسول، مع جميع البطاقات والباركودات الأصلية سليمة.</li>
          <li>انتظر مراجعة فريقنا لطلبك وتزويدك بالتعليمات التالية.</li>
        </ol>
      </section>

      <section className="s2-static-section">
        <h2>6. شروط مهمة</h2>
        <ul>
          <li>يجب تقديم طلبات الاستبدال خلال 7 أيام من استلام الطلب.</li>
          <li>الاستبدال يخضع لتوفر المنتج.</li>
          <li>قد تُطبَّق رسوم استلام على الاستبدال.</li>
          <li>المنتجات المستعملة أو المغسولة أو المُعادة دون بطاقاتها وباركوداتها الأصلية قد لا تكون مؤهلة للاستبدال.</li>
          <li>يجب الإبلاغ عن المنتجات التالفة أو الخاطئة فورًا مع إثباتات واضحة.</li>
          <li>الاسترداد والاستبدال للمنتجات التالفة أو المعيبة أو الخاطئة يخضعان للتحقق والموافقة.</li>
        </ul>
      </section>

      <section className="s2-static-section">
        <h2>7. تواصل معنا</h2>
        <p>
          لطلبات الاستبدال أو استفسارات الاسترداد أو أي استفسار عن المنتجات، يُرجى التواصل مع FEMNIA عبر دعم واتساب الرسمي.
        </p>
        <p>
          📞 / واتساب: <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">+974 6654 3343</a>
        </p>
        <p><strong>FEMNIA – أناقة | راحة | أسعار مناسبة</strong></p>
        <p>شكرًا لتسوّقك مع FEMNIA!</p>
      </section>
    </>
  );
}

export default function ReturnPolicy() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  return (
    <StaticPage
      title="Return & Exchange Policy"
      titleAr="سياسة الإرجاع والاستبدال"
      description="FEMNIA return & exchange policy: 7-day exchanges on unused items with tags and barcodes intact; refunds only for verified damaged, defective or incorrect products."
      descriptionAr="سياسة الإرجاع والاستبدال لدى FEMNIA: استبدال خلال 7 أيام للمنتجات غير المستعملة مع البطاقات والباركودات سليمة، والاسترداد فقط للمنتجات التالفة أو المعيبة أو الخاطئة بعد التحقق."
    >
      {isAr ? <ArabicBody /> : <EnglishBody />}
    </StaticPage>
  );
}
