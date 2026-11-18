import { useState } from "react";
export function useStored<T>(
  key: string,
  initial: T,
): [T, (value: T | ((old: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "null") ?? initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (next) =>
      setValue((previous) => {
        const updated =
          typeof next === "function" ? (next as (old: T) => T)(previous) : next;
        try {
          localStorage.setItem(key, JSON.stringify(updated));
        } catch {
          /* Browser may disable persistence. */
        }
        return updated;
      }),
  ];
}
