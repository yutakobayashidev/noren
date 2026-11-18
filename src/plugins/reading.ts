import type { SocialPost } from "../domain/model";
import { postIdentity } from "../domain/model";
import { t } from "../lib/i18n";

const contributions = [
  ["flare.profile-links", "Linked profiles", "Profile"],
  ["flare.event-tabs", "Event timelines", "Timeline"],
  ["flare.updates", "Followed updates", "Saved posts"],
  ["flare.crosspost", "Cross-post preview", "New post"],
  ["flare.notes", "Private notes", "Saved posts"],
  ["flare.speech", "Read aloud", "Post action"],
  ["flare.feed-filter", "Filter reposts", "Timeline"],
  ["flare.link-groups", "Group shared links", "Timeline"],
] as const;
export const readingPlugins = contributions.map(([id, name, category]) => ({
  id,
  grant: id,
  name: t(name),
  category: t(category),
  author: "Noren",
  permissions: undefined,
}));

export function groupedFeed(posts: SocialPost[], enabled: boolean) {
  const groups = new Map<string, SocialPost[]>();
  for (const post of posts) {
    // Hidden content must never expose links through a group heading.
    const url =
      enabled && !post.sensitive && !post.contentWarning
        ? post.text.match(/https?:\/\/[^\s<>"）)]+/i)?.[0]?.replace(/[.,!?。]+$/, "")
        : undefined;
    const key = url || postIdentity(post);
    const group = groups.get(key);
    if (group) group.push(post);
    else groups.set(key, [post]);
  }
  return [...groups.entries()];
}
