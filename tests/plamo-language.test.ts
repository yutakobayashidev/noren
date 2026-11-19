import { describe, expect, test } from "vite-plus/test";
import { detectLanguage, needsTranslation } from "../src/plugins/plamo/language";

describe("detectLanguage", () => {
  test.each([
    ["今日は良い天気ですね。散歩に行きます。", "ja"],
    ["カタカナ", "ja"],
    ["今天天气很好，我们去散步吧。", "zh"],
    ["오늘은 날씨가 좋네요.", "ko"],
    ["I am reading a book about the history of the web.", "en"],
    ["Je lis un livre sur l'histoire du web.", "latin"],
    ["Привет, как дела?", "other"],
  ])("%s → %s", (text, language) => {
    expect(detectLanguage(text)).toBe(language);
  });

  test("ignores links, mentions, hashtags and custom emoji", () => {
    expect(detectLanguage("https://example.org/some/english/path @alice #news :blobcat:")).toBe(
      undefined,
    );
    expect(detectLanguage("@alice@example.org ありがとう https://example.org/thanks")).toBe("ja");
  });

  test("returns nothing for emoji or a single word", () => {
    expect(detectLanguage("🎉🎉")).toBeUndefined();
    expect(detectLanguage("Hello")).toBeUndefined();
  });
});

describe("needsTranslation", () => {
  test("translates English posts from any network for a Japanese reader", () => {
    expect(needsTranslation("The new release is out today.", "ja")).toBe(true);
    expect(needsTranslation("The new release is out today.", "ja", "en")).toBe(true);
  });

  test("skips posts already in the target language", () => {
    expect(needsTranslation("新しい版を公開しました。", "ja")).toBe(false);
    expect(needsTranslation("The new release is out today.", "en")).toBe(false);
    expect(needsTranslation("新版本今天发布了。", "zh")).toBe(false);
  });

  test("uses a declared language to tell Latin-script languages apart", () => {
    expect(needsTranslation("Die neue Version ist heute erschienen.", "en", "de")).toBe(true);
    expect(needsTranslation("Die neue Version ist heute erschienen.", "en")).toBe(true);
  });

  test("ignores a declared tag that contradicts the script", () => {
    // Bluesky fills `langs` from the app language, not from the text.
    expect(needsTranslation("The new release is out today.", "en", "ja")).toBe(false);
    expect(needsTranslation("新しい版を公開しました。", "ja", "en")).toBe(false);
  });
});
