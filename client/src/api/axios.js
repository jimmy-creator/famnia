import axios from 'axios';
import { STAFF_BASE } from '../App';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// A 401 from these is a wrong password/PIN, not an expired session — the
// calling screen shows the error itself, so never log out or redirect.
const CREDENTIAL_URLS = ['/auth/login', '/auth/google', '/cashier/login'];

// No Bearer token — authentication is via httpOnly cookie only
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url;
    // Only redirect to login if user was logged in and session expired
    // Don't redirect for initial profile checks or public pages
    if (error.response?.status === 401 && url !== '/auth/profile' && !CREDENTIAL_URLS.includes(url)) {
      const path = window.location.pathname;
      if (path === '/hub' || path.startsWith('/hub/')) {
        // Staff hub: an expired session goes back to the hub sign-in.
        localStorage.removeItem('user');
        if (path !== '/hub/login' && path !== '/hub/reset-password' && url !== '/hub/access') {
          window.location.href = '/hub/login';
        }
      } else if (path.includes(STAFF_BASE)) {
        // POS till: an expired cashier session goes back to the POS login,
        // never the storefront. The POS login page handles its own 401s
        // (the admin-only /locations probe), and Pos.jsx handles /cashier/me.
        localStorage.removeItem('user');
        if (!path.endsWith('/login') && url !== '/cashier/me') {
          window.location.href = `${STAFF_BASE}/login`;
        }
      } else {
        const hadUser = localStorage.getItem('user');
        if (hadUser) {
          localStorage.removeItem('user');
          if (!['/login', '/register', '/forgot-password', '/', '/products'].includes(path) &&
              !path.startsWith('/product/')) {
            window.location.href = '/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
