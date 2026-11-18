export type Platform =
  "twitter" | "mastodon" | "bluesky" | "misskey" | "nostr" | "rss";
export type Account = {
  id: string;
  platform: Platform;
  displayName: string;
  handle: string;
  avatarUrl?: string;
  origin: string;
  canPost: boolean;
};
export type SocialPost = {
  key: string;
  platform: Platform;
  nativeId: string;
  accountId: string;
  url: string;
  text: string;
  html?: string;
  createdAt?: string;
  author: { name: string; handle: string; avatarUrl?: string };
  media?: {
    type: "photo" | "video" | "gif";
    url: string;
    previewUrl?: string;
    alt?: string;
  }[];
  contentWarning?: string;
  sensitive?: boolean;
  community?: string;
  boostedBy?: { name: string; handle: string };
  quotedPost?: SocialPost;
  likes?: number;
  reposts?: number;
  replies?: number;
  liked?: boolean;
  reposted?: boolean;
  cid?: string;
  likeUri?: string;
  repostUri?: string;
  readOnly?: boolean;
};
export type FeedSource = {
  kind: "home" | "search" | "user" | "list";
  query?: string;
  target?: string;
};
export type FeedPage = { posts: SocialPost[]; nextCursor?: string };
export type Notification = {
  id: string;
  reason: string;
  author: SocialPost["author"];
  createdAt: string;
  post?: SocialPost;
};
export type Tab = {
  id: string;
  title: string;
  accountId: string;
  source: FeedSource;
};
export const platformNames: Record<Platform, string> = {
  twitter: "X",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  misskey: "Misskey",
  nostr: "Nostr",
  rss: "RSS",
};
export function postIdentity(post: SocialPost) {
  return `${post.accountId}:${post.key}`;
}
export function mergePosts(previous: SocialPost[], incoming: SocialPost[]) {
  const posts = new Map(previous.map((post) => [postIdentity(post), post]));
  incoming.forEach((post) => posts.set(postIdentity(post), post));
  return [...posts.values()].sort(
    (a, b) =>
      (Date.parse(b.createdAt ?? "") || 0) -
      (Date.parse(a.createdAt ?? "") || 0),
  );
}
