import { sitePage } from "./links";
export type Locale = "ja" | "en" | "zh";
export const locales: Locale[] = ["ja", "en", "zh"];
export const localizedPath = (locale: Locale, path = "") =>
  sitePage((locale === "ja" ? "" : locale + "/") + path);
export const translator = (locale: Locale) => (ja: string, en: string, zh: string) =>
  ({ ja, en, zh })[locale];
