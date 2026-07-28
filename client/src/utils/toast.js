import toast from 'react-hot-toast';

export function showToast(message, type = 'success') {
  const isMarketplace = document.body.classList.contains('theme-marketplace');
  const isStore2 = !!document.querySelector('.s2-root');

  if (isStore2) {
    toast[type](message, {
      style: {
        background: 'rgba(255, 255, 255, 0.82)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        color: '#0f172a',
        fontSize: '0.88rem',
        fontFamily: "'DM Sans', sans-serif",
        borderRadius: '999px',
        padding: '10px 18px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0, 20, 60, 0.1)',
      },
      iconTheme: {
        primary: type === 'error' ? '#ef4444' : '#8B1A1A',
        secondary: '#fff',
      },
    });
  } else if (isMarketplace) {
    toast[type](message, {
      style: {
        background: '#fff',
        color: '#1a1a2e',
        fontSize: '0.88rem',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        borderRadius: '14px',
        padding: '12px 20px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        border: '1px solid #f3f4f6',
      },
      iconTheme: {
        primary: type === 'error' ? '#ef4444' : '#2563eb',
        secondary: '#fff',
      },
    });
  } else {
    toast[type](message, {
      style: {
        background: '#1a1614',
        color: '#f5f0eb',
        fontSize: '0.88rem',
        fontFamily: "'Outfit', sans-serif",
        borderRadius: '4px',
      },
      iconTheme: { primary: '#c4784a', secondary: '#f5f0eb' },
    });
  }
}
