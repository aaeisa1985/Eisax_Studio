export type SlideThemeId = "default" | "obsidian" | "sky" | "gold" | "light";

export interface SlideTheme {
  id: SlideThemeId;
  labelEn: string;
  labelAr: string;
  bgHex: string;
  titleHex: string;
  subtitleHex: string;
  bodyHex: string;
  accentHex: string;
  cardBgHex: string;
  borderHex: string;
}

export const SLIDE_THEMES: Record<SlideThemeId, SlideTheme> = {
  default: {
    id: "default",
    labelEn: "EISAX Clean",
    labelAr: "أيزاكس النقي",
    bgHex: "FBFDFF",
    titleHex: "17222E",
    subtitleHex: "44586E",
    bodyHex: "253647",
    accentHex: "00A89E",
    cardBgHex: "EEF6F9",
    borderHex: "D5E4EC",
  },
  obsidian: {
    id: "obsidian",
    labelEn: "Obsidian Dark",
    labelAr: "أوبسيديان الداكن",
    bgHex: "0B1420",
    titleHex: "F0F6FC",
    subtitleHex: "9DB0C4",
    bodyHex: "D9E4EF",
    accentHex: "00D4C8",
    cardBgHex: "132235",
    borderHex: "243952",
  },
  sky: {
    id: "sky",
    labelEn: "Sky Executive",
    labelAr: "سماء تنفيذي",
    bgHex: "F5FAFF",
    titleHex: "0F2942",
    subtitleHex: "3B6287",
    bodyHex: "1E3A56",
    accentHex: "0EA5E9",
    cardBgHex: "E6F3FC",
    borderHex: "C3E0F7",
  },
  gold: {
    id: "gold",
    labelEn: "Warm Gold",
    labelAr: "ذهبي دافئ",
    bgHex: "FCFBF7",
    titleHex: "1F1B12",
    subtitleHex: "6B5B3E",
    bodyHex: "362F22",
    accentHex: "C59B27",
    cardBgHex: "F6F0DF",
    borderHex: "E6D9B5",
  },
  light: {
    id: "light",
    labelEn: "Minimal Paper",
    labelAr: "ورقي بسيط",
    bgHex: "FFFFFF",
    titleHex: "111827",
    subtitleHex: "6B7280",
    bodyHex: "374151",
    accentHex: "0F172A",
    cardBgHex: "F3F4F6",
    borderHex: "E5E7EB",
  },
};

export function resolveSlideTheme(themeId?: string | null): SlideTheme {
  if (themeId && themeId in SLIDE_THEMES) {
    return SLIDE_THEMES[themeId as SlideThemeId];
  }
  return SLIDE_THEMES.default;
}
