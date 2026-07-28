import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Always boot i18next so useTranslation() returns real strings in every
// store, not bare keys like "cart.total". Stores without
// VITE_FEATURE_I18N just stay on English — the /ar route + locale
// switcher are still gated by I18N_ENABLED in App.jsx so other stores
// can't navigate into Arabic.
function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

import('./i18n').then(render).catch((err) => {
  console.error('[i18n] failed to load, rendering anyway:', err);
  render();
});
