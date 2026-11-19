// TypeScript port of Flare social/mastodon MastodonDataSource, MastodonLoader and status mapping.
import sanitizeHtml from "sanitize-html";
import type { SocialPost, FeedSource, FeedPage, Notification } from "../../src/domain/model";
import type { StoredAccount } from "../store";
import { publicJson } from "../http";

export function webUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return;
  }
}
export function mapMastodon(raw: any, account: StoredAccount): SocialPost {
  const post = raw.reblog ?? raw;
  const author = (user: any) => ({
    name: user.display_name || user.username,
    handle: user.acct.includes("@") ? user.acct : `${user.acct}@${new URL(account.origin).host}`,
    avatarUrl: webUrl(user.avatar),
  });
  const html = sanitizeHtml(post.content, {
    allowedTags: ["p", "br", "a", "span", "strong", "em", "code", "pre", "blockquote"],
    allowedAttributes: { a: ["href", "rel", "target"] },
    allowedSchemes: ["https", "http"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  });
  return {
    key: `mastodon:${post.uri}`,
    nativeId: post.id,
    replyToId: post.in_reply_to_id,
    accountId: account.id,
    platform: "mastodon",
    url: webUrl(post.url) ?? webUrl(post.uri) ?? account.origin,
    author: author(post.account),
    html,
    text: sanitizeHtml(html.replace(/<\/p>/g, "\n"), {
      allowedTags: [],
      allowedAttributes: {},
    }),
    language: typeof post.language === "string" ? post.language : undefined,
    createdAt: post.created_at,
    sensitive: post.sensitive,
    contentWarning: post.spoiler_text,
    boostedBy: raw.reblog ? author(raw.account) : undefined,
    likes: post.favourites_count,
    reposts: post.reblogs_count,
    replies: post.replies_count,
    liked: post.favourited,
    reposted: post.reblogged,
    media: (post.media_attachments ?? [])
      .filter((m: any) => webUrl(m.url) && ["image", "video", "gifv"].includes(m.type))
      .map((m: any) => ({
        type: m.type === "image" ? "photo" : m.type === "gifv" ? "gif" : "video",
        url: m.url,
        previewUrl: webUrl(m.preview_url),
        alt: m.description ?? "",
      })),
  };
}
export function mastodonRequest(
  account: StoredAccount,
  path: string,
  body?: unknown,
  method?: string,
) {
  return publicJson(new URL(path, account.origin), {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(account.token ? { authorization: `Bearer ${account.token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
export function nextCursor(link: string | null, origin: string, path: string) {
  for (const part of link?.split(",") ?? []) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) continue;
    try {
      const u = new URL(match[1]);
      const id = u.searchParams.get("max_id");
      if (u.origin === origin && u.pathname === path && id && /^\d+$/.test(id)) return id;
    } catch {
      /* Ignore malformed continuations. */
    }
  }
}
export async function mastodonFeed(
  account: StoredAccount,
  source: FeedSource,
  cursor?: string,
): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: "30" });
  let path = account.token ? "/api/v1/timelines/home" : "/api/v1/trends/statuses";
  if (!account.token && source.kind === "home") {
    params.set("offset", cursor || "0");
    const { data } = await mastodonRequest(account, `${path}?${params}`);
    return {
      posts: data.map((p: any) => mapMastodon(p, account)),
      nextCursor: data.length === 30 ? String(Number(cursor || 0) + 30) : undefined,
    };
  }
  if (source.kind === "search") {
    path = "/api/v2/search";
    params.set("q", source.query || "");
    params.set("type", "statuses");
    params.set("offset", cursor || "0");
  } else {
    if (cursor) params.set("max_id", cursor);
    if (source.kind === "list")
      path = `/api/v1/timelines/list/${encodeURIComponent(source.target || "")}`;
    if (source.kind === "user") {
      const { data } = await mastodonRequest(
        account,
        `/api/v1/accounts/lookup?acct=${encodeURIComponent(source.target || "")}`,
      );
      path = `/api/v1/accounts/${data.id}/statuses`;
    }
  }
  const { data, response } = await mastodonRequest(account, `${path}?${params}`);
  const statuses = source.kind === "search" ? data.statuses : data;
  return {
    posts: statuses.map((p: any) => mapMastodon(p, account)),
    nextCursor:
      source.kind === "search"
        ? statuses.length === 30
          ? String(Number(cursor || 0) + 30)
          : undefined
        : nextCursor(response.headers.get("link"), account.origin, path),
  };
}
export async function mastodonNotifications(account: StoredAccount): Promise<Notification[]> {
  const { data } = await mastodonRequest(account, "/api/v1/notifications?limit=30");
  return data.map((n: any) => ({
    id: n.id,
    reason: n.type,
    createdAt: n.created_at,
    author: {
      name: n.account.display_name || n.account.username,
      handle: n.account.acct,
      avatarUrl: webUrl(n.account.avatar),
    },
    post: n.status ? mapMastodon(n.status, account) : undefined,
  }));
}
