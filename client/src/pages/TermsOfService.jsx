import { Link } from 'react-router-dom';

export default function TermsOfService() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <Link to="/" style={{ fontSize: '0.85rem', color: '#888', textDecoration: 'none' }}>← Back to home</Link>
      <h1 style={{ margin: '1.5rem 0 0.5rem' }}>Terms of Service</h1>
      <p style={{ color: '#555', lineHeight: 1.7 }}>
        By using ShopHub, you agree to our terms. All purchases are final unless eligible for return under our return policy. We reserve the right to refuse service to anyone.
      </p>
    </div>
  );
}
