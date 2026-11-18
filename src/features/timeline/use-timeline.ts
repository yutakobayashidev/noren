import { useState, useEffect, useRef, useCallback } from "react";
import type { FeedSource, SocialPost, FeedPage } from "../../domain/model";
import { mergePosts, postIdentity } from "../../domain/model";
import { api, errorMessage } from "../../lib/api";
type AccountPage = { cursor?: string; done: boolean; error?: string };
export function useTimeline(accountIds: string[], source: FeedSource, refresh: number) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [pages, setPages] = useState<Record<string, AccountPage>>({});
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const key = JSON.stringify([accountIds, source, refresh]);
  const load = useCallback(
    async (reset = false) => {
      if (lock.current && !reset) return;
      if (reset) {
        controller.current?.abort();
        controller.current = new AbortController();
        setPosts([]);
        pagesRef.current = {};
        setPages({});
      }
      const current = controller.current;
      if (!current) return;
      lock.current = true;
      setLoading(true);
      const ids = accountIds.filter((id) => reset || !pagesRef.current[id]?.done);
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const page = await api<FeedPage>(
              "/api/timeline",
              {
                accountId: id,
                source,
                cursor: reset ? undefined : pagesRef.current[id]?.cursor,
              },
              undefined,
              current.signal,
            );
            return { id, page };
          } catch (error) {
            return { id, error: errorMessage(error) };
          }
        }),
      );
      if (current.signal.aborted) return;
      setPosts((old) =>
        mergePosts(
          reset ? [] : old,
          results.flatMap((r) => r.page?.posts || []),
        ),
      );
      setPages((old) => {
        const next = reset ? {} : { ...old };
        for (const result of results)
          next[result.id] = result.page
            ? { cursor: result.page.nextCursor, done: !result.page.nextCursor }
            : { ...old[result.id], done: false, error: result.error };
        return next;
      });
      lock.current = false;
      setLoading(false);
    },
    [key],
  );
  useEffect(() => {
    void load(true);
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
    loadMore: () => load(),
    update,
  };
}
