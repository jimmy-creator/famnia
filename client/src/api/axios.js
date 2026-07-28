import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// No Bearer token — authentication is via httpOnly cookie only
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect to login if user was logged in and session expired
    // Don't redirect for initial profile checks or public pages
    if (error.response?.status === 401 && error.config?.url !== '/auth/profile') {
      const hadUser = localStorage.getItem('user');
      if (hadUser) {
        localStorage.removeItem('user');
        if (!['/login', '/register', '/forgot-password', '/', '/products'].includes(window.location.pathname) &&
            !window.location.pathname.startsWith('/product/')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
