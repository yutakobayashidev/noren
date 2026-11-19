export const targetLanguages = ["ja", "en", "zh"] as const;
export type TargetLanguage = (typeof targetLanguages)[number];

const english = new Set(
  "the a an and or but of to in on at for with from by is are was were be been it this that these those i you he she we they my your our their not no do does did have has had will would can could just what when how all about if so as".split(
    " ",
  ),
);

// Returns a primary language tag guessed from the characters of the text,
// "latin" for non-English Latin script, or undefined when there is too little text.
export function detectLanguage(text: string) {
  const body = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(^|\s)[@#][^\s]+/g, " ")
    .replace(/:[a-z0-9_+-]+:/gi, " ");
  const count = (pattern: RegExp) => body.match(pattern)?.length ?? 0;
  const kana = count(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han = count(/\p{Script=Han}/gu);
  const hangul = count(/\p{Script=Hangul}/gu);
  const latin = count(/\p{Script=Latin}/gu);
  const letters = count(/\p{L}/gu);
  if (letters < 2) return;
  if (kana && kana + han >= letters * 0.3) return "ja";
  if (hangul >= letters * 0.3) return "ko";
  if (han >= letters * 0.3) return "zh";
  if (latin >= letters * 0.6) {
    const words = body.toLowerCase().match(/[a-z']+/g) ?? [];
    if (words.length < 2) return;
    const hits = words.filter((word) => english.has(word)).length;
    return hits / words.length >= 0.15 ? "en" : "latin";
  }
  return "other";
}

// A declared tag from the network (Mastodon `language`, Bluesky `langs`) is used
// only when it does not contradict the script of the text.
export function needsTranslation(text: string, target: TargetLanguage, declared?: string) {
  const detected = detectLanguage(text);
  if (!detected) return false;
  const tag = declared?.toLowerCase().split("-")[0];
  if (detected === "en" || detected === "latin")
    return (
      (tag && /^[a-z]{2,3}$/.test(tag) && !["ja", "zh", "ko"].includes(tag) ? tag : detected) !==
      target
    );
  return detected !== target;
}
