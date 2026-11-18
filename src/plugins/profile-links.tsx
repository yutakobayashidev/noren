import { useState, useEffect } from "react";
import type { Account } from "../domain/model";
import { t } from "../lib/i18n";
import { api, errorMessage } from "../lib/api";
function profileTarget(value: string, account: Account) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password) return;
  const parts = url.pathname.split("/").filter(Boolean);
  switch (account.platform) {
    case "twitter":
      return ["x.com", "twitter.com"].includes(url.hostname) &&
        parts.length === 1 &&
        /^[a-z0-9_]{1,15}$/i.test(parts[0])
        ? parts[0]
        : undefined;
    case "bluesky":
      return url.hostname === "bsky.app" && parts[0] === "profile" && parts.length === 2
        ? parts[1]
        : undefined;
    case "nostr":
      return url.hostname === "njump.me" && parts.length === 1 && /^[0-9a-f]{64}$/.test(parts[0])
        ? parts[0]
        : undefined;
    default:
      return parts.length === 1 && /^@[\w.-]+$/.test(parts[0])
        ? parts[0].slice(1) + "@" + url.host
        : undefined;
  }
}
export function ProfileLinks({
  accountId,
  handle,
  accounts,
  open,
}: {
  accountId: string;
  handle: string;
  accounts: Account[];
  open: (id: string, handle: string) => void;
}) {
  const [links, setLinks] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLinks([]);
    setError("");
    api<{ links: string[] }>(
      "/api/profile-links",
      { accountId, handle },
      undefined,
      controller.signal,
    )
      .then((r) => {
        if (!controller.signal.aborted) setLinks(r.links);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [accountId, handle]);
  const options = accounts.flatMap((a) =>
    [...new Set(links.map((l) => profileTarget(l, a)))]
      .filter((h) => h && (a.id !== accountId || h !== handle))
      .map((h) => ({ a, h: h! })),
  );
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {options.length > 0 && (
        <section>
          <h2>{t("Linked profiles")}</h2>
          {options.map(({ a, h }) => (
            <button key={a.id + h} onClick={() => open(a.id, h)}>
              {h} · {a.displayName}
            </button>
          ))}
        </section>
      )}
    </>
  );
}
