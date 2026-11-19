import { useState, useEffect, useRef, useCallback } from "react";
import type { FeedSource, SocialPost, FeedPage } from "../../domain/model";
import { mergePosts, postIdentity } from "../../domain/model";
import { api, errorMessage } from "../../lib/api";
type AccountPage = { cursor?: string; done: boolean; error?: string };
// Posts missing between a refresh and the posts already shown below it, as in Flare. The row sits
// above the post `before` and reads older posts from `cursor`, one page per tap.
export type TimelineGap = {
  id: string;
  accountId: string;
  before: string;
  cursor: string;
  loading?: boolean;
  failed?: boolean;
};
function fetchPage(
  accountId: string,
  source: FeedSource,
  cursor: string | undefined,
  signal: AbortSignal,
) {
  return api<FeedPage>("/api/timeline", { accountId, source, cursor }, undefined, signal);
}
// A refresh reads only the newest page. When that page does not reach the account's posts already
// shown, the posts in between are missing.
function gapAfterRefresh(accountId: string, page: FeedPage, shown: SocialPost[]) {
  const below = shown.find((post) => post.accountId === accountId);
  const ids = new Set(shown.map(postIdentity));
  if (!below || !page.nextCursor || !page.posts.length) return [];
  if (page.posts.some((post) => ids.has(postIdentity(post)))) return [];
  const before = postIdentity(below);
  return [{ id: before, accountId, before, cursor: page.nextCursor }];
}
export function useTimeline(
  accountIds: string[],
  source: FeedSource,
  refresh: number,
  sources?: Record<string, FeedSource>,
) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [pages, setPages] = useState<Record<string, AccountPage>>({});
  const [gaps, setGaps] = useState<TimelineGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErrors, setRefreshErrors] = useState<{ id: string; message: string }[]>([]);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const gapsRef = useRef(gaps);
  gapsRef.current = gaps;
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
        setGaps([]);
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
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const page = await fetchPage(
              id,
              sources?.[id] ?? source,
              mode === "more" ? pagesRef.current[id]?.cursor : undefined,
              current.signal,
            );
            return { id, page };
          } catch (error) {
            return { id, error: errorMessage(error) };
          }
        }),
      );
      if (current.signal.aborted) return;
      beforeMerge?.();
      if (latest) {
        const added = results.flatMap((r) =>
          r.page ? gapAfterRefresh(r.id, r.page, postsRef.current) : [],
        );
        setGaps((old) => [...old, ...added.filter((gap) => !old.some((o) => o.id === gap.id))]);
        setRefreshErrors(results.flatMap((r) => (r.error ? [{ id: r.id, message: r.error }] : [])));
      }
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
  const loadGap = useCallback(
    async (id: string, beforeMerge: () => void) => {
      const gap = gapsRef.current.find((item) => item.id === id);
      const current = controller.current;
      if (!gap || !current || lock.current) return;
      lock.current = true;
      setGaps((old) =>
        old.map((item) => (item.id === id ? { ...item, loading: true, failed: false } : item)),
      );
      let page: FeedPage | undefined;
      try {
        page = await fetchPage(
          gap.accountId,
          sources?.[gap.accountId] ?? source,
          gap.cursor,
          current.signal,
        );
      } catch {
        // The row offers a retry below.
      }
      if (current.signal.aborted) return;
      lock.current = false;
      const shown = new Set(postsRef.current.map(postIdentity));
      const fresh = page?.posts.filter((post) => !shown.has(postIdentity(post))) ?? [];
      // The row goes once its page reaches posts already shown or the timeline ends. A page that
      // neither adds posts nor moves the cursor would repeat forever, so it counts as a failure.
      const closed = page && (!page.nextCursor || fresh.length < page.posts.length);
      const advanced = page && (fresh.length > 0 || page.nextCursor !== gap.cursor);
      const next: TimelineGap | null = closed
        ? null
        : page && advanced
          ? { ...gap, cursor: page.nextCursor ?? gap.cursor, loading: false }
          : { ...gap, loading: false, failed: true };
      // Keep the reader in place whenever posts arrive or the row disappears.
      if (page && (fresh.length || closed)) beforeMerge();
      if (page && fresh.length) {
        const loaded = page.posts;
        setPosts((old) => mergePosts(old, loaded));
      }
      setGaps((old) => old.flatMap((item) => (item.id !== id ? [item] : next ? [next] : [])));
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
    // Any load in progress, including a gap, which does not show the bottom spinner.
    busy: loading || gaps.some((gap) => gap.loading),
    errors: Object.entries(pages)
      .filter(([, p]) => p.error)
      .map(([id, p]) => ({ id, message: p.error! })),
    hasMore: accountIds.some((id) => !pages[id]?.done),
    loadMore: () => load("more"),
    loadLatest: (beforeMerge: () => void) => load("latest", beforeMerge),
    refreshing,
    refreshErrors,
    gaps,
    loadGap,
    update,
  };
}
