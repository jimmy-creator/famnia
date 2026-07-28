import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <Link to="/" style={{ fontSize: '0.85rem', color: '#888', textDecoration: 'none' }}>← Back to home</Link>
      <h1 style={{ margin: '1.5rem 0 0.5rem' }}>Privacy Policy</h1>
      <p style={{ color: '#555', lineHeight: 1.7 }}>
        We respect your privacy. Your personal information is used solely to process orders and improve your shopping experience. We do not sell or share your data with third parties.
      </p>
    </div>
  );
}
