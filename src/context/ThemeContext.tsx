import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

/**
 * Light or dark, following the phone unless told otherwise.
 *
 * It used to default to light and only ever change when somebody found the
 * toggle in the old header — a header no screen renders any more, so dark mode
 * had become unreachable. Following the system is also the honest default: a
 * phone in dark mode at midnight is already saying what it wants, and the
 * point of this theme is not being handed a white page in bed.
 *
 * An explicit choice still wins, and is remembered. Anyone who set one before
 * keeps it.
 */

type Preference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  isDark: boolean;
  /** What the user asked for, which may be "whatever the phone says". */
  preference: Preference;
  setPreference: (preference: Preference) => void;
  /** Light ⇄ dark, and stops following the system. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'app-theme';

const readPreference = (): Preference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    return 'system';
  }
};

const systemPrefersDark = (): boolean => {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    // Old WebViews without matchMedia get the light theme, which is the safer
    // of the two to be wrong about in daylight.
    return false;
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<Preference>(readPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // The phone can change theme while the app is open — on a schedule, or
  // because somebody flipped it in the shade.
  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const isDark = preference === 'system' ? systemDark : preference === 'dark';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    // Tells the browser to draw its own furniture — form controls, the
    // scrollbar, and the WebView's background during a reload — to match.
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const setPreference = useCallback((next: Preference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Private mode: the choice holds for this session only. */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(isDark ? 'light' : 'dark');
  }, [isDark, setPreference]);

  return (
    <ThemeContext.Provider value={{ isDark, preference, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
