import { createContext, useContext, useEffect, useRef, useState } from "react";
import { postIdentity, type SocialPost } from "../domain/model";
import { WatchButton } from "./follow-ups";
import { t } from "../lib/i18n";
import { EnabledActions } from "./post-actions";
export const Notes = createContext<{
  notes: Record<string, string>;
  change: (key: string, value: string) => void;
}>({ notes: {}, change: () => {} });
export function PostReadingTools({
  post,
  saved,
  translation,
}: {
  post: SocialPost;
  saved: boolean;
  translation?: string;
}) {
  const enabled = useContext(EnabledActions);
  const { notes, change } = useContext(Notes);
  const key = postIdentity(post);
  const active = useRef<SpeechSynthesisUtterance | null>(null);
  const [speechError, setSpeechError] = useState("");
  useEffect(
    () => () => {
      if (active.current) {
        active.current = null;
        window.speechSynthesis?.cancel();
      }
    },
    [enabled, post.key, post.accountId],
  );
  function speak(text: string) {
    const speech = window.speechSynthesis;
    if (!speech) {
      setSpeechError(t("Speech is unavailable"));
      return;
    }
    speech.cancel();
    const item = new SpeechSynthesisUtterance(text);
    active.current = item;
    item.onend = item.onerror = () => {
      if (active.current === item) active.current = null;
    };
    speech.speak(item);
  }
  return (
    <>
      {enabled.includes("flare.updates") && <WatchButton post={post} />}
      {enabled.includes("flare.notes") && saved && (
        <label className="block py-2">
          {t("Private note")}
          <textarea
            value={notes[key] ?? ""}
            maxLength={4000}
            onChange={(e) => change(key, e.target.value)}
          />
        </label>
      )}
      {enabled.includes("flare.speech") && (
        <div className="flex flex-wrap gap-3 text-sm">
          <button onClick={() => speak(post.text)}>{t("Read aloud")}</button>
          {translation && (
            <button onClick={() => speak(translation)}>{t("Read translation aloud")}</button>
          )}
          <button onClick={() => window.speechSynthesis?.cancel()}>{t("Stop reading")}</button>
          {speechError && <span role="alert">{speechError}</span>}
        </div>
      )}
    </>
  );
}
