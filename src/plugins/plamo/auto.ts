import { createContext } from "react";
import type { TargetLanguage } from "./language";

export type AutoTranslateSettings = { enabled: boolean; language: TargetLanguage };
// Undefined while the PLaMo plugin itself is disabled.
export const AutoTranslate = createContext<AutoTranslateSettings | undefined>(undefined);

type Job = {
  promise: Promise<string>;
  controller: AbortController;
  users: number;
  started: boolean;
};
const jobs = new Map<string, Job>();
const results = new Map<string, string>();

export function cachedTranslation(text: string, language: string) {
  return results.get(language + "\0" + text);
}

// Posts that scroll past before their turn are dropped from the queue. Once inference has
// started it runs to the end, because cancelling it would reload the model in a new worker.
export async function autoTranslate(text: string, language: string, signal: AbortSignal) {
  const key = language + "\0" + text;
  const done = results.get(key);
  if (done) return done;
  let job = jobs.get(key);
  if (!job) {
    const controller = new AbortController();
    const { translate } = await import("./client");
    job = jobs.get(key);
    if (!job) {
      const created: Job = { controller, users: 0, started: false, promise: undefined! };
      created.promise = translate(text, language, controller.signal, undefined, {
        interactive: false,
        onStart: () => (created.started = true),
      }).then(
        (value) => {
          if (jobs.get(key) === created) jobs.delete(key);
          if (results.size > 500) results.delete(results.keys().next().value!);
          results.set(key, value);
          return value;
        },
        (error) => {
          if (jobs.get(key) === created) jobs.delete(key);
          throw error;
        },
      );
      jobs.set(key, created);
      job = created;
    }
  }
  const active = job;
  active.users++;
  const leave = () => {
    active.users--;
    if (active.users || active.started) return;
    if (jobs.get(key) === active) jobs.delete(key);
    active.controller.abort();
  };
  signal.addEventListener("abort", leave, { once: true });
  try {
    return await Promise.race([
      active.promise,
      new Promise<never>((_, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Cancelled", "AbortError")),
          {
            once: true,
          },
        ),
      ),
    ]);
  } finally {
    if (!signal.aborted) {
      signal.removeEventListener("abort", leave);
      active.users--;
    }
  }
}
