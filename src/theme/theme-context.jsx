import React, { createContext, use, useMemo, useState, useEffect, useCallback } from "react";
import { THEMES, DEFAULT_THEME_ID } from "./themes";

const ThemeContext = createContext({
  themeId: DEFAULT_THEME_ID,
  setTheme: () => {},
  themes: THEMES
});

const themeMap = THEMES.reduce((acc, theme) => {
  acc[theme.id] = theme;
  return acc;
}, {});

const applyThemeToDom = (theme) => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme.id;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme.meta.themeColor);
  }
};

export const ThemeProvider = ({ children }) => {
  const [themeId, setThemeId] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_THEME_ID;
    }

    const stored = window.localStorage.getItem("theme");
    const resolvedTheme = themeMap[stored] || themeMap[DEFAULT_THEME_ID];
    return resolvedTheme.id;
  });

  const setTheme = useCallback((nextThemeId) => {
    const resolvedTheme = themeMap[nextThemeId] || themeMap[DEFAULT_THEME_ID];
    setThemeId(resolvedTheme.id);

    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", resolvedTheme.id);
    }
  }, []);

  useEffect(() => {
    const resolvedTheme = themeMap[themeId] || themeMap[DEFAULT_THEME_ID];
    applyThemeToDom(resolvedTheme);
  }, [themeId]);

  const value = useMemo(
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
