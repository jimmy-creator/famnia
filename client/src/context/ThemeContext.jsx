import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';
import themes, { defaultTheme } from '@layout/themes';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const themeList = Object.entries(themes).map(([id, t]) => ({
  id, name: t.name, description: t.description,
}));

export function ThemeProvider({ children }) {
  const [currentTheme, setCurrentTheme] = useState(() => {
    return localStorage.getItem('store-theme') || defaultTheme || 'marketplace';
  });

  // Fetch store theme setting on mount
  useEffect(() => {
    api.get('/settings/theme').then((res) => {
      if (res.data.theme && themes[res.data.theme]) {
        setCurrentTheme(res.data.theme);
        localStorage.setItem('store-theme', res.data.theme);
      }
    }).catch(() => {});
  }, []);

  // Apply theme CSS variables
  useEffect(() => {
    const theme = themes[currentTheme];
    if (!theme) return;

    const root = document.documentElement;

    // Reset all possible vars
    const allVars = new Set();
    Object.values(themes).forEach((t) => Object.keys(t.vars).forEach((k) => allVars.add(k)));
    allVars.forEach((key) => root.style.removeProperty(key));

    // Remove all theme extra classes
    Object.values(themes).forEach((t) => {
      if (t.extraClass) document.body.classList.remove(t.extraClass);
    });

    // Apply new theme vars
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Apply extra class if exists
    if (theme.extraClass) {
      document.body.classList.add(theme.extraClass);
    }

    // Load theme font if needed
    if (theme.font) {
      const fontId = `theme-font-${currentTheme}`;
      if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${theme.font}&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, [currentTheme]);

  const changeTheme = async (themeId) => {
    if (!themes[themeId]) return;
    setCurrentTheme(themeId);
    localStorage.setItem('store-theme', themeId);
    // Persist to server (admin only)
    try {
      await api.put('/settings/theme', { theme: themeId });
    } catch (e) {}
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, changeTheme, themes: themeList }}>
      {children}
    </ThemeContext.Provider>
  );
}
