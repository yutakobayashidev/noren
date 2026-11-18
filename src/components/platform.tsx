import { Rss, Globe } from "lucide-react";
import type { Platform } from "../domain/model";
export function PlatformIcon({
  platform,
  size = 18,
}: {
  platform: Platform | "mixed";
  size?: number;
}) {
  if (platform === "mixed") return <Rss size={size} />;
  if (platform === "bluesky")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#1685ff" aria-hidden="true">
        <path d="M5.2 3.8C8 5.9 10.9 10.1 12 12.4c1.1-2.3 4-6.5 6.8-8.6 2-1.5 5.2-2.6 5.2 1.1 0 .7-.4 5.9-.7 6.8-.9 3-4 3.8-6.7 3.3 4.8.8 6 3.3 3.4 5.8-4.9 5-7-1.3-7.6-2.9-.1-.3-.2-.4-.4-.4s-.3.1-.4.4c-.6 1.6-2.7 7.9-7.6 2.9-2.6-2.5-1.4-5 3.4-5.8-2.7.5-5.8-.3-6.7-3.3C.4 10.8 0 5.6 0 4.9 0 1.2 3.2 2.3 5.2 3.8Z" />
      </svg>
    );
  if (platform === "mastodon")
    return (
      <span
        aria-hidden="true"
        className="platform-m"
        style={{ width: size, height: size, fontSize: size * 0.8 }}
      >
        m
      </span>
    );
  if (platform === "twitter")
    return (
      <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1 }} aria-hidden="true">
        𝕏
      </span>
    );
  return <Globe size={size} />;
}
export function Avatar({ name, url, size = 42 }: { name: string; url?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span>{name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}
