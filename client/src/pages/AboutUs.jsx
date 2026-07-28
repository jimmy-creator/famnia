import { Link } from 'react-router-dom';

export default function AboutUs() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem' }}>
      <Link to="/" style={{ fontSize: '0.85rem', color: '#888', textDecoration: 'none' }}>← Back to home</Link>
      <h1 style={{ margin: '1.5rem 0 0.5rem' }}>About Us</h1>
      <p style={{ color: '#555', lineHeight: 1.7 }}>
        ShopHub is a curated online store offering quality products across all categories. We are committed to providing the best shopping experience with fast shipping and excellent customer service.
      </p>
    </div>
  );
}
