import { useState, useEffect, useRef, useCallback } from "react";
import type { FeedSource, SocialPost, FeedPage } from "../../domain/model";
import { mergePosts, postIdentity } from "../../domain/model";
import { api, errorMessage } from "../../lib/api";
type AccountPage = { cursor?: string; done: boolean; error?: string };
// Extra pages a refresh may read, after the newest one, to reach the posts already shown.
const gapPages = 2;
export function useTimeline(
  accountIds: string[],
  source: FeedSource,
  refresh: number,
  sources?: Record<string, FeedSource>,
) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [pages, setPages] = useState<Record<string, AccountPage>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErrors, setRefreshErrors] = useState<{ id: string; message: string }[]>([]);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const key = JSON.stringify([accountIds, source, refresh, sources]);
  const load = useCallback(
    async (mode: "reset" | "more" | "latest", beforeMerge?: () => void) => {
      const reset = mode === "reset";
      const latest = mode === "latest";
      if (lock.current && !reset) return;
      if (reset) {
        controller.current?.abort();
        controller.current = new AbortController();
        setPosts([]);
        setRefreshErrors([]);
        pagesRef.current = {};
        setPages({});
      }
      const current = controller.current;
      if (!current) return;
      lock.current = true;
      setLoading(true);
      setRefreshing(latest);
      const ids = accountIds.filter((id) => mode !== "more" || !pagesRef.current[id]?.done);
      const shown = new Set(postsRef.current.map(postIdentity));
      const shownAccounts = new Set(postsRef.current.map((post) => post.accountId));
      const request = (id: string, cursor?: string) =>
        api<FeedPage>(
          "/api/timeline",
          { accountId: id, source: sources?.[id] ?? source, cursor },
          undefined,
          current.signal,
        );
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            let page = await request(
              id,
              mode === "more" ? pagesRef.current[id]?.cursor : undefined,
            );
            if (latest && shownAccounts.has(id)) {
              // More posts may have arrived than one page holds. Read on until the new posts reach
              // one already shown, so the posts in between are not silently skipped.
              const fetched = [...page.posts];
              for (let extra = 0; extra < gapPages; extra++) {
                if (!page.nextCursor || page.posts.some((post) => shown.has(postIdentity(post))))
                  break;
                page = await request(id, page.nextCursor);
                fetched.push(...page.posts);
              }
              page = { ...page, posts: fetched };
            }
            return { id, page };
          } catch (error) {
            return { id, error: errorMessage(error) };
          }
        }),
      );
      if (current.signal.aborted) return;
      beforeMerge?.();
      if (latest)
        setRefreshErrors(results.flatMap((r) => (r.error ? [{ id: r.id, message: r.error }] : [])));
      setPosts((old) =>
        mergePosts(
          reset ? [] : old,
          results.flatMap((r) => r.page?.posts || []),
        ),
      );
      setPages((old) => {
        const next = reset ? {} : { ...old };
        for (const result of results) {
          const previous = old[result.id];
          // A refresh reads only the newest posts, so it keeps the cursor into older pages. It takes
          // over the page state only for an account whose first load failed.
          if (latest && (!result.page || !previous?.error || previous.cursor)) continue;
          next[result.id] = result.page
            ? { cursor: result.page.nextCursor, done: !result.page.nextCursor }
            : { ...old[result.id], done: false, error: result.error };
        }
        return next;
      });
      lock.current = false;
      setLoading(false);
      setRefreshing(false);
    },
    [key],
  );
  useEffect(() => {
    void load("reset");
    return () => {
      controller.current?.abort();
      lock.current = false;
    };
  }, [load]);
  const update = (post: SocialPost) =>
    setPosts((old) => old.map((p) => (postIdentity(p) === postIdentity(post) ? post : p)));
  return {
    posts,
    loading,
    errors: Object.entries(pages)
      .filter(([, p]) => p.error)
      .map(([id, p]) => ({ id, message: p.error! })),
    hasMore: accountIds.some((id) => !pages[id]?.done),
    loadMore: () => load("more"),
    loadLatest: (beforeMerge: () => void) => load("latest", beforeMerge),
    refreshing,
    refreshErrors,
    update,
  };
}
