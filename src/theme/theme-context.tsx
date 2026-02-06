import { createContext, use, useMemo, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { THEMES, DEFAULT_THEME_ID, type Theme } from "./themes";

const THEME_STORAGE_KEY = "theme:v1";
const LEGACY_THEME_STORAGE_KEY = "theme";

type ThemeContextValue = {
  themeId: string;
  setTheme: (nextThemeId: string) => void;
  themes: Theme[];
};

const ThemeContext = createContext<ThemeContextValue>({
  themeId: DEFAULT_THEME_ID,
  setTheme: (_nextThemeId: string) => {},
  themes: THEMES
});

const themeMap = THEMES.reduce<Record<string, Theme>>((acc, theme) => {
  acc[theme.id] = theme;
  return acc;
}, {});

const applyThemeToDom = (theme: Theme) => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme.id;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme.meta.themeColor);
  }
};

type ThemeProviderProps = {
  children: ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [themeId, setThemeId] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_THEME_ID;
    }

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (!stored) {
        // One-time migration from legacy key.
        const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
        if (legacy) {
          stored = legacy;
          window.localStorage.setItem(THEME_STORAGE_KEY, legacy);
          window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
        }
      }
    } catch {
      stored = null;
    }

    const resolvedTheme = themeMap[stored] || themeMap[DEFAULT_THEME_ID];
    return resolvedTheme.id;
  });

  const setTheme = useCallback((nextThemeId: string) => {
    const resolvedTheme = themeMap[nextThemeId] || themeMap[DEFAULT_THEME_ID];
    setThemeId(resolvedTheme.id);

    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme.id);
      } catch {
        // localStorage may throw in private browsing / quota exceeded.
      }
    }
  }, []);

  useEffect(() => {
    const resolvedTheme = themeMap[themeId] || themeMap[DEFAULT_THEME_ID];
    applyThemeToDom(resolvedTheme);
  }, [themeId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      setTheme,
      themes: THEMES
    }),
    [themeId, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => use(ThemeContext);
