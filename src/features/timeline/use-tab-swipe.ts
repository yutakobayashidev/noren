import { useRef, type TouchEvent } from "react";

export function useTabSwipe(onSwipe: (offset: -1 | 1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(event: TouchEvent) {
      const touch = event.touches[0];
      start.current =
        event.touches.length === 1 &&
        event.target instanceof Element &&
        !event.target.closest("video, input, select, textarea, [role=dialog]")
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },
    onTouchMove(event: TouchEvent) {
      if (!start.current) return;
      const touch = event.touches[0];
      const dx = Math.abs(touch.clientX - start.current.x);
      const dy = Math.abs(touch.clientY - start.current.y);
      if (dy >= 12 && dy >= dx) start.current = null;
    },
    onTouchEnd(event: TouchEvent) {
      const origin = start.current;
      start.current = null;
      if (!origin || event.touches.length) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) >= 60 && Math.abs(dx) >= 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}
