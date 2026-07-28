import { BrowserRouter, Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useEffect, Fragment } from 'react';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { ThemeProvider } from './context/ThemeContext';
import { RecentlyViewedProvider } from './context/RecentlyViewedContext';
import { Home, Navbar, Footer, Products, ProductDetail, ContactUs, AboutUs, PrivacyPolicy, RefundPolicy, ReturnPolicy, ShippingPolicy, TermsOfService, FloatingWhatsApp } from '@layout';
import Wishlist from './pages/Wishlist';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Login from './pages/Login';
import Register from './pages/Register';
import Orders from './pages/Orders';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import OrderSuccess from './pages/OrderSuccess';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ShippingInfo from './pages/ShippingInfo';
import Wholesale from './pages/Wholesale';
import WholesaleRequest from './pages/WholesaleRequest';
import WholesaleQuotes from './pages/WholesaleQuotes';
import WholesaleQuoteDetail from './pages/WholesaleQuoteDetail';
import ShiprocketCheckout from './pages/ShiprocketCheckout';
import PosLogin from './pages/PosLogin';
import Pos from './pages/Pos';

const B2B_ENABLED = import.meta.env.VITE_FEATURE_B2B === 'true';
const SHIPROCKET_CHECKOUT = import.meta.env.VITE_FEATURE_SHIPROCKET_CHECKOUT === 'true';
const MULTILOC_ENABLED = import.meta.env.VITE_FEATURE_MULTILOC === 'true';
const I18N_ENABLED = import.meta.env.VITE_FEATURE_I18N === 'true';

// LocaleManager couples i18next with the URL.
//   - URL has /ar/ prefix → set i18n to 'ar'.
//   - URL has no prefix but i18n is still 'ar' → an internal absolute
//     <Link to="/..."> navigated us away from the locale. Restore the
//     /ar/ prefix.
//   - URL has no prefix and i18n is 'en' → English. No-op.
//
// LanguageSwitcher MUST call i18n.changeLanguage('en') before
// navigating to a non-/ar URL, otherwise we'd bounce back to /ar.
function LocaleManager() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!I18N_ENABLED) return;
    const isArUrl = pathname === '/ar' || pathname.startsWith('/ar/');
    import('./i18n').then(({ default: i18n }) => {
      if (isArUrl) {
        if (i18n.language !== 'ar') i18n.changeLanguage('ar');
        return;
      }
      if (i18n.language === 'ar') {
        // Internal Link stripped the /ar prefix — put it back.
        const newPath = '/ar' + (pathname === '/' ? '' : pathname);
        navigate(newPath + search + hash, { replace: true });
        return;
      }
      if (i18n.language !== 'en') i18n.changeLanguage('en');
    });
  }, [pathname, search, hash, navigate]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PageWrapper({ children }) {
  const { pathname } = useLocation();
  return <div key={pathname} className="page-transition">{children}</div>;
}

// Hide the storefront navbar + footer on POS routes — the POS is a
// full-screen kiosk experience and the marketing chrome doesn't
// belong there. We also hide them on /admin so the back-office has its
// own dedicated chrome.
// Non-obvious staff-only base path. Used in place of the old /pos so the
// POS surface doesn't show up to customers/bots scanning common routes.
// The auth gate is still the real protection — this is just hygiene.
export const STAFF_BASE = '/anfal-staff-x7k2';
function PosAware({ children }) {
  const { pathname } = useLocation();
  if (pathname === STAFF_BASE || pathname === `${STAFF_BASE}/login`) return null;
  if (pathname.startsWith('/admin')) return null;
  return children;
}

let didInitialStaffRedirect = false;

function StaffGate({ children }) {
  const { user } = useAuth();
  const isStaff = user && (user.role === 'admin' || user.role === 'staff');
  if (isStaff && !didInitialStaffRedirect) {
    didInitialStaffRedirect = true;
    return <Navigate to="/admin" replace />;
  }
  return children;
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function App() {
  const app = (
    <HelmetProvider>
    <BrowserRouter>
      <ScrollToTop />
      <LocaleManager />
      <AuthProvider>
        <CartProvider>
        <WishlistProvider>
        <RecentlyViewedProvider>
        <ThemeProvider>
          <Toaster position="top-right" />
          <div className="app">
            <PosAware><Navbar /></PosAware>
            <main className="main">
              <PageWrapper>
              <Routes>
                {/* Storefront + admin routes, mounted twice for path-based
                    locale: bare paths are English (default), /ar/* serves
                    the Arabic-locale version. The LocaleManager above
                    syncs i18next + dir/lang from the URL on every change.
                    Same elements are reused — the locale lives in the URL
                    and i18n state, not in the component tree. */}
                {/* Only mount the /ar/* mirror routes when i18n is on
                    for this store. Other stores get the original
                    single-locale route table — no extra crawlable URLs. */}
                {(I18N_ENABLED ? [null, 'ar'] : [null]).map((loc) => {
                  const p = (path) => (loc ? `/${loc}${path === '/' ? '' : path}` : path);
                  return (
                    <Fragment key={loc || 'en'}>
                      <Route path={p('/')} element={<StaffGate><Home /></StaffGate>} />
                      <Route path={p('/products')} element={<Products />} />
                      <Route path={p('/product/:slug')} element={<ProductDetail />} />
                      <Route path={p('/cart')} element={<Cart />} />
                      <Route path={p('/checkout')} element={SHIPROCKET_CHECKOUT ? <ShiprocketCheckout /> : <Checkout />} />
                      <Route path={p('/login')} element={<StaffGate><Login /></StaffGate>} />
                      <Route path={p('/register')} element={<Register />} />
                      <Route path={p('/orders')} element={<Orders />} />
                      <Route path={p('/profile')} element={<Profile />} />
                      <Route path={p('/admin')} element={<Admin />} />
                      <Route path={p('/order-success')} element={<OrderSuccess />} />
                      <Route path={p('/wishlist')} element={<Wishlist />} />
                      <Route path={p('/forgot-password')} element={<ForgotPassword />} />
                      <Route path={p('/reset-password')} element={<ResetPassword />} />
                      <Route path={p('/contact')} element={<ContactUs />} />
                      <Route path={p('/shipping-info')} element={<ShippingInfo />} />
                      <Route path={p('/return-policy')} element={<ReturnPolicy />} />
                      <Route path={p('/about')} element={<AboutUs />} />
                      <Route path={p('/privacy-policy')} element={<PrivacyPolicy />} />
                      <Route path={p('/refund-policy')} element={<RefundPolicy />} />
                      <Route path={p('/shipping-policy')} element={<ShippingPolicy />} />
                      <Route path={p('/terms')} element={<TermsOfService />} />
                      {B2B_ENABLED && <Route path={p('/wholesale')} element={<Wholesale />} />}
                      {B2B_ENABLED && <Route path={p('/wholesale/request')} element={<WholesaleRequest />} />}
                      {B2B_ENABLED && <Route path={p('/wholesale/my-quotes')} element={<WholesaleQuotes />} />}
                      {B2B_ENABLED && <Route path={p('/wholesale/my-quotes/:id')} element={<WholesaleQuoteDetail />} />}
                      {MULTILOC_ENABLED && <Route path={p(`${STAFF_BASE}/login`)} element={<PosLogin />} />}
                      {MULTILOC_ENABLED && <Route path={p(STAFF_BASE)} element={<Pos />} />}
                    </Fragment>
                  );
                })}
              </Routes>
              </PageWrapper>
            </main>
            <PosAware><Footer /></PosAware>
            <PosAware><FloatingWhatsApp /></PosAware>
          </div>
        </ThemeProvider>
        </RecentlyViewedProvider>
        </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
    </HelmetProvider>
  );

  if (googleClientId) {
    return <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider>;
  }
  return app;
}
