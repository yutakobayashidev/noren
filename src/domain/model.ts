export type Platform = "twitter" | "mastodon" | "bluesky" | "misskey" | "nostr";
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
  replyToId?: string;
  accountId: string;
  url: string;
  text: string;
  /** Language declared by the network, such as Mastodon `language` or Bluesky `langs`. */
  language?: string;
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
  kind: "home" | "recommended" | "search" | "user" | "list";
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
  sources?: Record<string, FeedSource>;
  expiresAt?: number;
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
};
export function postIdentity(post: SocialPost) {
  return `${post.accountId}:${post.key}`;
}
export function supportsRecommended(platform: Platform) {
  return platform === "twitter";
}
export function mergePosts(previous: SocialPost[], incoming: SocialPost[], ranked = false) {
  const posts = new Map(previous.map((post) => [postIdentity(post), post]));
  incoming.forEach((post) => posts.set(postIdentity(post), post));
  if (ranked) return [...posts.values()];
  return [...posts.values()].sort(
    (a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0),
  );
}
