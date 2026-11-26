import { EnabledActions } from "../../plugins/post-actions";
import { groupedFeed } from "../../plugins/reading";
import { useStored } from "../../lib/storage";
import { t } from "../../lib/i18n";
import { useEffect, useRef, useContext } from "react";
import { LoaderCircle, Check, RefreshCw } from "lucide-react";
import type { Account, FeedSource, SocialPost } from "../../domain/model";
import { postIdentity } from "../../domain/model";
import { useTimeline, type TimelineGap } from "./use-timeline";
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
  hideCounts?: boolean;
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
  const newPosts = useNewPosts(timeline, feed.posts, feed.gaps);
  function refreshLatest() {
    void feed.loadLatest(newPosts.keepPosition);
  }
  // A gap row goes above the first displayed post at or after the post it was made for, so a
  // filter that hides that post does not hide the row.
  const order = new Map(feed.posts.map((post, index) => [postIdentity(post), index]));
  const gapAbove = new Map<string, TimelineGap>();
  for (const gap of feed.gaps) {
    const start = order.get(gap.before);
    const below =
      start === undefined
        ? undefined
        : visible.find((post) => (order.get(postIdentity(post)) ?? -1) >= start);
    if (below && !gapAbove.has(postIdentity(below))) gapAbove.set(postIdentity(below), gap);
  }
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || feed.busy || feed.errors.length || !feed.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void feed.loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [feed.busy, feed.hasMore, feed.posts.length, feed.errors.length]);
  return (
    <>
      <PullToRefresh
        enabled={pullEnabled}
        loading={feed.busy}
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
            disabled={feed.busy}
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
        {groups.flatMap(([key, posts]) => {
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
          const item =
            posts.length === 1 ? (
              cards[0]
            ) : (
              <details key={key} className="rounded-lg border p-3">
                <summary>
                  {t("Shared link")} · {posts.length} · {key}
                </summary>
                {cards}
              </details>
            );
          const below = posts.map(postIdentity).find((id) => gapAbove.has(id));
          const gap = below && gapAbove.get(below);
          if (!below || !gap) return [item];
          return [
            <GapRow
              key={"gap:" + gap.id}
              gap={gap}
              disabled={feed.busy}
              onLoad={() => void feed.loadGap(gap.id, () => newPosts.keepPosition(below))}
            />,
            item,
          ];
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
          <Button variant="ghost" disabled={feed.busy} onClick={() => void feed.loadMore()}>
            {t("Load more")}
          </Button>
        </div>
      ) : (
        !!feed.posts.length && <p className="end-of-feed">{t("You’re all caught up")}</p>
      )}
    </>
  );
}
// Flare's row for posts missing between a refresh and the posts below it.
function GapRow({
  gap,
  disabled,
  onLoad,
}: {
  gap: TimelineGap;
  disabled: boolean;
  onLoad: () => void;
}) {
  return (
    <div className="timeline-gap">
      <Button
        variant="secondary"
        className="h-auto min-h-10 w-full whitespace-normal"
        disabled={disabled}
        onClick={onLoad}
      >
        {t(
          gap.loading
            ? "Loading missing posts…"
            : gap.failed
              ? "Could not load posts. Tap to retry."
              : "Load missing posts",
        )}
      </Button>
    </div>
  );
}
