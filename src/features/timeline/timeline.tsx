import { EnabledActions } from "../../plugins/post-actions";
import { groupedFeed } from "../../plugins/reading";
import { useStored } from "../../lib/storage";
import { t } from "../../lib/i18n";
import { useEffect, useRef, useContext } from "react";
import { LoaderCircle, Check, RefreshCw } from "lucide-react";
import type { Account, FeedSource, SocialPost } from "../../domain/model";
import { postIdentity } from "../../domain/model";
import { useTimeline } from "./use-timeline";
import { PullToRefresh } from "./pull-to-refresh";
import { NewPostsButton, useNewPosts } from "./new-posts";
import { PostCard } from "./post-card";
import { Button } from "../../components/ui/button";
export type PostInteractions = {
  onReply: (p: SocialPost) => void;
  onThread: (p: SocialPost) => void;
  onProfile: (p: SocialPost) => void;
  saved: SocialPost[];
  onSave: (p: SocialPost) => void;
};
export function Timeline({
  sources,
  pullEnabled,
  preferencesKey,
  accounts,
  source,
  refresh,
  layout,
  ...interactions
}: {
  sources?: Record<string, FeedSource>;
  pullEnabled: boolean;
  preferencesKey: string;
  accounts: Account[];
  source: FeedSource;
  refresh: number;
  layout: "list" | "grid" | "compact";
} & PostInteractions) {
  const feed = useTimeline(
    accounts.map((a) => a.id),
    source,
    refresh,
    sources,
  );
  const enabled = useContext(EnabledActions);
  const [filter, setFilter] = useStored<"all" | "original" | "repost">(preferencesKey, "all");
  const filterEnabled = enabled.includes("flare.feed-filter");
  const visible = feed.posts.filter(
    (post) => !filterEnabled || filter === "all" || (filter === "repost") === !!post.boostedBy,
  );
  const groups = groupedFeed(visible, enabled.includes("flare.link-groups"));
  const timeline = useRef<HTMLDivElement>(null);
  const newPosts = useNewPosts(timeline, feed.posts);
  function refreshLatest() {
    void feed.loadLatest(newPosts.keepPosition);
  }
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || feed.loading || feed.errors.length || !feed.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void feed.loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [feed.loading, feed.hasMore, feed.posts.length, feed.errors.length]);
  return (
    <>
      <PullToRefresh
        enabled={pullEnabled}
        loading={feed.loading}
        refreshing={feed.refreshing}
        onRefresh={refreshLatest}
      />
      <NewPostsButton count={newPosts.count} onClick={newPosts.showLatest} />
      {[
        ...feed.refreshErrors.map((error) => ({
          ...error,
          key: "refresh:" + error.id,
          retry: refreshLatest,
        })),
        ...feed.errors.map((error) => ({
          ...error,
          key: "page:" + error.id,
          retry: feed.loadMore,
        })),
      ].map((error) => (
        <div role="alert" className="feed-error" key={error.key}>
          <div>
            <strong>{accounts.find((a) => a.id === error.id)?.displayName}</strong>
            <p>{error.message}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={feed.loading}
            onClick={() => void error.retry()}
          >
            <RefreshCw />
            {t("Retry")}
          </Button>
        </div>
      ))}
      {filterEnabled && (
        <label className="block px-4 py-2">
          {t("Filter reposts")}{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">{t("All posts")}</option>
            <option value="original">{t("Original posts")}</option>
            <option value="repost">{t("Reposts")}</option>
          </select>
        </label>
      )}
      <div ref={timeline} className={`timeline ${layout}`}>
        {groups.map(([key, posts]) => {
          const cards = posts.map((post) => (
            <PostCard
              key={postIdentity(post)}
              post={post}
              onUpdate={feed.update}
              compact={layout === "compact"}
              {...interactions}
              saved={interactions.saved.some((p) => postIdentity(p) === postIdentity(post))}
            />
          ));
          return posts.length === 1 ? (
            cards[0]
          ) : (
            <details key={key} className="rounded-lg border p-3">
              <summary>
                {t("Shared link")} · {posts.length} · {key}
              </summary>
              {cards}
            </details>
          );
        })}
      </div>
      {feed.loading && !feed.refreshing && (
        <div className="loading-state" role="status">
          <LoaderCircle className="animate-spin" size={22} />
          <span>{t("Loading posts…")}</span>
        </div>
      )}
      {!feed.loading && !visible.length && !feed.errors.length && (
        <div className="empty-state">
          <Check size={28} />
          <h2>{t("Nothing here yet")}</h2>
          <p>{t("New posts will appear here.")}</p>
        </div>
      )}
      {feed.hasMore && !feed.errors.length ? (
        <div ref={sentinel} className="load-more">
          <Button variant="ghost" disabled={feed.loading} onClick={() => void feed.loadMore()}>
            {t("Load more")}
          </Button>
        </div>
      ) : (
        !!feed.posts.length && <p className="end-of-feed">{t("You’re all caught up")}</p>
      )}
    </>
  );
}
