import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ChevronsUp } from "lucide-react";
import type { SocialPost } from "../../domain/model";
import { t } from "../../lib/i18n";
import type { TimelineGap } from "./use-timeline";

function cards(list: HTMLElement) {
  return Array.from(list.querySelectorAll<HTMLElement>("[data-post-id]"));
}

// Keeps the post on screen in place when newer posts are inserted above it, and counts those
// posts until the reader scrolls up to them, as Flare's "N new posts" button does.
export function useNewPosts(
  timeline: RefObject<HTMLDivElement | null>,
  posts: SocialPost[],
  gaps: TimelineGap[],
) {
  const anchor = useRef<{ id: string; top: number; shown: Set<string> } | null>(null);
  const [count, setCount] = useState(0);
  // Runs after posts or gap rows change, since both move the posts below them.
  useLayoutEffect(() => {
    const list = timeline.current;
    const scroll = list?.parentElement;
    if (!list || !scroll) return;
    const rendered = cards(list);
    if (!rendered.length) setCount(0);
    const saved = anchor.current;
    anchor.current = null;
    if (!saved) return;
    const card = rendered.find((element) => element.dataset.postId === saved.id);
    if (card) scroll.scrollTop += card.getBoundingClientRect().top - saved.top;
    // Posts above the first one shown before the refresh are new, unless the reader is still at
    // the top and already sees them.
    const added = rendered.findIndex((element) => saved.shown.has(element.dataset.postId!));
    if (added > 0 && scroll.scrollTop > 0) setCount((value) => value + added);
  }, [timeline, posts, gaps]);
  useEffect(() => {
    const element = timeline.current;
    const container = element?.parentElement;
    if (!count || !element || !container) return;
    const list = element;
    const scroll = container;
    function consume() {
      if (scroll.scrollTop <= 0) {
        setCount(0);
        return;
      }
      // The first new post on screen and those below it have been seen.
      const top = scroll.getBoundingClientRect().top;
      const seen = cards(list)
        .slice(0, count)
        .findIndex((card) => card.getBoundingClientRect().bottom > top);
      if (seen >= 0) setCount(seen);
    }
    scroll.addEventListener("scroll", consume, { passive: true });
    return () => scroll.removeEventListener("scroll", consume);
  }, [timeline, count]);
  return {
    count,
    // Call just before the rows change. Like Flare, a gap load keeps the post below the gap in
    // place while it is on screen; otherwise the first post on screen stays.
    keepPosition(preferred?: string) {
      const list = timeline.current;
      const scroll = list?.parentElement;
      if (!list || !scroll) return;
      const rendered = cards(list);
      const { top, bottom } = scroll.getBoundingClientRect();
      const card =
        rendered.find((element) => {
          const rect = element.getBoundingClientRect();
          return element.dataset.postId === preferred && rect.bottom > top && rect.top < bottom;
        }) ?? rendered.find((element) => element.getBoundingClientRect().bottom > top);
      if (card)
        anchor.current = {
          id: card.dataset.postId!,
          top: card.getBoundingClientRect().top,
          shown: new Set(rendered.map((element) => element.dataset.postId!)),
        };
    },
    showLatest() {
      setCount(0);
      timeline.current?.parentElement?.scrollTo({ top: 0 });
    },
  };
}

export function NewPostsButton({ count, onClick }: { count: number; onClick: () => void }) {
  // Keep the last count on the button while it slides away.
  const [label, setLabel] = useState(count);
  if (count && count !== label) setLabel(count);
  return (
    <div className="new-posts">
      <button type="button" data-shown={count > 0 || undefined} onClick={onClick}>
        <ChevronsUp size={16} />
        {(label === 1 ? t("1 new post") : t("{count} new posts")).replace("{count}", String(label))}
      </button>
    </div>
  );
}
