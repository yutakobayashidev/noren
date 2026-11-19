import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { t } from "../../lib/i18n";

// Material 3 pull-to-refresh, as in Flare for Android: the indicator travels half as far as the
// finger, refreshes once it has moved 80 px, and slows down past that point.
const threshold = 80;
const indicatorSize = 48;
function indicatorOffset(pulled: number) {
  const offset = pulled * 0.5;
  if (offset <= threshold) return offset;
  const tension = Math.min(offset / threshold - 1, 2);
  return threshold * (1 + tension - tension ** 2 / 4);
}

const standaloneQuery = "(display-mode: standalone)";
function subscribeStandalone(onChange: () => void) {
  const media = matchMedia(standaloneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function isStandalone() {
  return (
    matchMedia(standaloneQuery).matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

// Rendered as the first child of the feed's scroll container. The pull distance lives here so a
// pull re-renders only this indicator, not every post card.
export function PullToRefresh({
  enabled,
  loading,
  refreshing,
  onRefresh,
}: {
  enabled: boolean;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone);
  const marker = useRef<HTMLDivElement>(null);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const container = marker.current?.parentElement;
    if (!enabled || !standalone || !container) return;
    const scroll = container;
    scroll.classList.add("pull-enabled");
    let start: { x: number; y: number } | undefined;
    let pulled = 0;
    let ready = false;
    function cancel() {
      start = undefined;
      pulled = 0;
      ready = false;
      setOffset(0);
    }
    function begin(event: TouchEvent) {
      cancel();
      if (
        loading ||
        scroll.scrollTop > 0 ||
        event.touches.length !== 1 ||
        !(event.target instanceof Element) ||
        event.target.closest("video, input, select, textarea, [role=dialog]")
      )
        return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    }
    function move(event: TouchEvent) {
      if (!start) return;
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = Math.abs(touch.clientX - start.x);
      // Wait until the finger has moved far enough to tell a pull from a tap or a sideways swipe.
      if (!pulled && Math.max(Math.abs(dy), dx) < 6) return;
      if (
        event.touches.length !== 1 ||
        dy <= 0 ||
        dx >= dy ||
        scroll.scrollTop > 0 ||
        !event.cancelable
      ) {
        cancel();
        return;
      }
      // Holding the list still during the pull also stops the iOS rubber band at the top.
      event.preventDefault();
      pulled = dy;
      const next = indicatorOffset(dy);
      // Like Flare, tap once whenever the pull crosses the threshold in either direction.
      if (next >= threshold !== ready) {
        ready = !ready;
        if ("vibrate" in navigator) navigator.vibrate(10);
      }
      setOffset(next);
    }
    function end(event: TouchEvent) {
      const trigger = ready && event.touches.length === 0;
      cancel();
      if (trigger) refresh.current();
    }
    scroll.addEventListener("touchstart", begin, { passive: true });
    scroll.addEventListener("touchmove", move, { passive: false });
    scroll.addEventListener("touchend", end);
    scroll.addEventListener("touchcancel", cancel);
    return () => {
      cancel();
      scroll.classList.remove("pull-enabled");
      scroll.removeEventListener("touchstart", begin);
      scroll.removeEventListener("touchmove", move);
      scroll.removeEventListener("touchend", end);
      scroll.removeEventListener("touchcancel", cancel);
    };
  }, [enabled, standalone, loading]);
  if (!enabled || !standalone) return null;
  const fraction = refreshing ? 1 : offset / threshold;
  return (
    <div ref={marker} className="pull-status">
      <span className="sr-only" role="status">
        {refreshing
          ? t("Loading posts…")
          : offset
            ? t(fraction >= 1 ? "Release to refresh" : "Pull to refresh")
            : ""}
      </span>
      <div
        className="pull-indicator"
        aria-hidden="true"
        data-dragging={(offset > 0 && !refreshing) || undefined}
        style={{ transform: `translateY(${fraction * threshold - indicatorSize}px)` }}
      >
        {refreshing ? (
          <LoaderCircle size={24} className="animate-spin" />
        ) : (
          <RefreshCw size={22} style={{ transform: `rotate(${fraction * 270}deg)` }} />
        )}
      </div>
    </div>
  );
}
