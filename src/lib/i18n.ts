import messages from "./messages.json";

type Language = "en" | "ja" | "zh";
const key = "flare:language";
export const preference = localStorage.getItem(key) || "auto";
const requested = preference === "auto" ? navigator.languages : [preference];
export const language: Language =
  requested
    .map((tag) => tag.toLowerCase().split("-")[0])
    .find((tag): tag is Language => ["en", "ja", "zh"].includes(tag)) ?? "en";
document.documentElement.lang = language === "zh" ? "zh-Hans" : language;
export function t(message: string) {
  const translations: Record<string, string[]> = messages;
  return language === "en"
    ? message
    : (translations[message]?.[language === "ja" ? 0 : 1] ?? message);
}
export function changeLanguage(value: string) {
  localStorage.setItem(key, value);
  location.reload();
}
