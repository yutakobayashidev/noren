import { createContext, useContext, useEffect, useState } from "react";
import { postIdentity, type SocialPost } from "../domain/model";
import { api, errorMessage } from "../lib/api";
import { t } from "../lib/i18n";
import { safeUrl } from "../features/timeline/post-card";
export type Watch = { post: SocialPost; links: string[] };
export const Watches = createContext<{ items: Watch[]; change: (items: Watch[]) => void }>({
  items: [],
  change: () => {},
});
export function WatchButton({ post }: { post: SocialPost }) {
  const { items, change } = useContext(Watches);
  const key = postIdentity(post);
  const watched = items.some((w) => postIdentity(w.post) === key);
  return (
    <button
      aria-pressed={watched}
      onClick={() =>
        change(
          watched
            ? items.filter((w) => postIdentity(w.post) !== key)
            : [...items, { post, links: [] }],
        )
      }
    >
      {t(watched ? "Stop following updates" : "Follow updates")}
    </button>
  );
}
function Updates({ watch, refresh }: { watch: Watch; refresh: number }) {
  const { items, change } = useContext(Watches);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const root = watch.post;
  useEffect(() => {
    const controller = new AbortController();
    setPosts([]);
    setError("");
    api<{ posts: SocialPost[] }>("/api/thread", root, undefined, controller.signal)
      .then(({ posts }) => {
        const byId = new Map(posts.map((p) => [p.nativeId, p]));
        const descendants = posts.filter((p) => {
          if (p.author.handle !== root.author.handle || p.nativeId === root.nativeId) return false;
          let parent = p.replyToId;
          const seen = new Set<string>();
          while (parent && !seen.has(parent)) {
            if (parent === root.nativeId) return true;
            seen.add(parent);
            parent = byId.get(parent)?.replyToId;
          }
          return false;
        });
        if (!controller.signal.aborted) setPosts(descendants);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [root, refresh]);
  return (
    <article className="post-card">
      <strong>{root.author.name}</strong>
      <p>{root.contentWarning || (root.sensitive ? t("Sensitive content") : root.text)}</p>
      {posts.map((p) => (
        <p key={postIdentity(p)}>
          <a href={safeUrl(p.url)} target="_blank" rel="noreferrer">
            {p.contentWarning || (p.sensitive ? t("Sensitive content") : p.text)}
          </a>
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      {watch.links.map((url) => (
        <p key={url}>
          <a href={safeUrl(url)} target="_blank" rel="noreferrer">
            {url}
          </a>
        </p>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const url = safeUrl(link);
          if (!url) return;
          change(
            items.map((w) => (w === watch ? { ...w, links: [...new Set([...w.links, url])] } : w)),
          );
          setLink("");
        }}
      >
        <label>
          {t("Related post URL")}
          <input type="url" required value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        <button>{t("Add link")}</button>
      </form>
      <WatchButton post={root} />
    </article>
  );
}
export function FollowUps({ refresh }: { refresh: number }) {
  const { items } = useContext(Watches);
  return (
    items.length > 0 && (
      <section>
        <h2>{t("Followed updates")}</h2>
        {items.map((w) => (
          <Updates key={postIdentity(w.post)} watch={w} refresh={refresh} />
        ))}
      </section>
    )
  );
}
