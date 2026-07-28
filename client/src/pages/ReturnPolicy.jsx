import { RotateCcw, ShieldCheck, Clock, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import SEO from '../components/SEO';

export default function ReturnPolicy() {
  return (
    <div className="static-page">
      <SEO title="Return & Refund Policy" description="Easy 30-day returns. Full refund or exchange on all products. Quick refund processing." />
      <div className="container">
        <div className="static-hero">
          <h1>Return & Refund Policy</h1>
          <p>Shop with confidence — we make returns easy.</p>
        </div>

        <div className="static-content">
          <div className="info-cards-grid">
            <div className="info-card">
              <RotateCcw size={24} />
              <h3>30-Day Returns</h3>
              <p>Return any item within 30 days of delivery for a full refund or exchange.</p>
            </div>
            <div className="info-card">
              <ShieldCheck size={24} />
              <h3>Quality Guarantee</h3>
              <p>If you receive a damaged or defective item, we'll replace it at no extra cost.</p>
            </div>
            <div className="info-card">
              <Clock size={24} />
              <h3>Quick Refunds</h3>
              <p>Refunds are processed within 5-7 business days after we receive the returned item.</p>
            </div>
          </div>

          <div className="static-section">
            <h2>How to Return an Item</h2>
            <div className="steps-list">
              <div className="step">
                <span className="step-number">1</span>
                <div>
                  <h4>Initiate a Return</h4>
                  <p>Go to "My Orders", find the order, and click "Request Return". Select the items you'd like to return and the reason.</p>
                </div>
              </div>
              <div className="step">
                <span className="step-number">2</span>
                <div>
                  <h4>Pack the Item</h4>
                  <p>Pack the item securely in its original packaging. Include all tags, accessories, and the invoice.</p>
                </div>
              </div>
              <div className="step">
                <span className="step-number">3</span>
                <div>
                  <h4>Schedule Pickup</h4>
                  <p>Our logistics partner will pick up the package from your address. You can also drop it at the nearest courier point.</p>
                </div>
              </div>
              <div className="step">
                <span className="step-number">4</span>
                <div>
                  <h4>Get Your Refund</h4>
                  <p>Once we receive and inspect the item, your refund will be processed to your original payment method within 5-7 business days.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="static-section">
            <h2>Eligible for Return</h2>
            <div className="static-grid">
              <div className="eligible-list">
                <h4><CheckCircle size={16} /> Returnable</h4>
                <ul className="static-list">
                  <li>Clothing & footwear (unworn, with tags)</li>
                  <li>Electronics (unused, sealed packaging)</li>
                  <li>Accessories (in original condition)</li>
                  <li>Home & living products (undamaged)</li>
                  <li>Defective or damaged items (any category)</li>
                  <li>Wrong item received</li>
                </ul>
              </div>
              <div className="eligible-list">
                <h4><XCircle size={16} /> Non-Returnable</h4>
                <ul className="static-list">
                  <li>Personalized or customized items</li>
                  <li>Undergarments and swimwear</li>
                  <li>Perishable goods (food items)</li>
                  <li>Digital downloads or gift cards</li>
                  <li>Items marked as "Final Sale"</li>
                  <li>Items returned after 30 days</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="static-section">
            <h2>Refund Methods</h2>
            <div className="refund-table">
              <div className="refund-row header">
                <span>Payment Method</span>
                <span>Refund To</span>
                <span>Timeline</span>
              </div>
              <div className="refund-row">
                <span>UPI / Wallet</span>
                <span>Original UPI / Wallet</span>
                <span>3-5 business days</span>
              </div>
              <div className="refund-row">
                <span>Credit / Debit Card</span>
                <span>Original card</span>
                <span>5-7 business days</span>
              </div>
              <div className="refund-row">
                <span>Net Banking</span>
                <span>Bank account</span>
                <span>5-7 business days</span>
              </div>
              <div className="refund-row">
                <span>Cash on Delivery</span>
                <span>Bank transfer (NEFT)</span>
                <span>7-10 business days</span>
              </div>
            </div>
          </div>

          <div className="static-section">
            <div className="static-callout">
              <AlertCircle size={20} />
              <div>
                <h4>Need Help?</h4>
                <p>If you have any questions about returns or refunds, contact us at <strong>support@shophub.com</strong> or call <strong>+91 9072262297</strong>. We're here to help!</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
