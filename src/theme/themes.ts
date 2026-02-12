export type Theme = {
  id: string;
  label: string;
  colors: {
    primary: string;
    primaryRgb: string;
    secondary: string;
    bg: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    error: string;
    errorMuted: string;
    success: string;
    successMuted: string;
    warning: string;
    warningMuted: string;
  };
  fonts: {
    sans: string;
    mono: string;
  };
  meta: {
    themeColor: string;
  };
};

export const THEMES: Theme[] = [
  {
    id: "default",
    label: "Cyber Default",
    colors: {
      primary: "#ff5f1f",
      primaryRgb: "255 95 31",
      secondary: "#00f0ff",
      bg: "#050505",
      surface: "#0f1115",
      surfaceAlt: "#1f2937",
      border: "#2a2f3a",
      borderStrong: "#334155",
      text: "#e2e8f0",
      textMuted: "#94a3b8",
      textSubtle: "#64748b",
      error: "#f87171",
      errorMuted: "#fca5a5",
      success: "#4ade80",
      successMuted: "#6ee7b7",
      warning: "#facc15",
      warningMuted: "#fde68a"
    },
    fonts: {
      sans: "\"Chakra Petch\", sans-serif",
      mono: "\"JetBrains Mono\", monospace"
    },
    meta: {
      themeColor: "#050505"
    }
  },
  {
    id: "ember",
    label: "Ember Noir",
    colors: {
      primary: "#ffb02e",
      primaryRgb: "255 176 46",
      secondary: "#4ade80",
      bg: "#0b0a07",
      surface: "#15120c",
      surfaceAlt: "#1f1a12",
      border: "#3a2f22",
      borderStrong: "#524032",
      text: "#f5f0e6",
      textMuted: "#c2b59f",
      textSubtle: "#8f7f67",
      error: "#fb923c",
      errorMuted: "#fdba74",
      success: "#a3e635",
      successMuted: "#bef264",
      warning: "#fbbf24",
      warningMuted: "#fcd34d"
    },
    fonts: {
      sans: "\"Chakra Petch\", sans-serif",
      mono: "\"JetBrains Mono\", monospace"
    },
    meta: {
      themeColor: "#0b0a07"
    }
  }
];

export const DEFAULT_THEME_ID = "default";
