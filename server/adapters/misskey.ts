// Port of Flare's MisskeyDataSource note/timeline/reaction responsibilities.
import type { StoredAccount } from "../store";
import type {
  SocialPost,
  FeedSource,
  FeedPage,
  Notification,
} from "../../src/domain/model";
import { publicJson } from "../http";
import { webUrl } from "./mastodon";
export const misskeyRequest = (
  a: StoredAccount,
  path: string,
  data: Record<string, unknown> = {},
) =>
  publicJson(new URL(`/api/${path}`, a.origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...data, i: a.token }),
  });
export function mapMisskey(raw: any, a: StoredAccount): SocialPost {
  const note = raw.renote && !raw.text && !raw.files?.length ? raw.renote : raw;
  const user = (u: any) => ({
    name: u.name || u.username,
    handle: `${u.username}@${u.host || new URL(a.origin).host}`,
    avatarUrl: webUrl(u.avatarUrl),
  });
  return {
    key: `misskey:${note.uri || a.origin + "/notes/" + note.id}`,
    nativeId: note.id,
    accountId: a.id,
    platform: "misskey",
    url: webUrl(note.url) || `${a.origin}/notes/${encodeURIComponent(note.id)}`,
    text: note.text || "",
    author: user(note.user),
    createdAt: note.createdAt,
    contentWarning: note.cw,
    sensitive: note.files?.some((f: any) => f.isSensitive),
    likes: Object.values(note.reactions || {}).reduce(
      (sum: number, value) => sum + Number(value),
      0,
    ),
    liked: !!note.myReaction,
    reposts: note.renoteCount,
    replies: note.repliesCount,
    boostedBy: note !== raw ? user(raw.user) : undefined,
    media: (note.files || [])
      .filter((f: any) => webUrl(f.url) && /^(image|video)\//.test(f.type))
      .map((f: any) => ({
        type: f.type.startsWith("image/") ? "photo" : "video",
        url: f.url,
        previewUrl: webUrl(f.thumbnailUrl),
        alt: f.comment || "",
      })),
  };
}
export async function misskeyFeed(
  a: StoredAccount,
  source: FeedSource,
  cursor?: string,
): Promise<FeedPage> {
  let path = "notes/timeline";
  let params: Record<string, unknown> = {
    limit: 30,
    ...(cursor ? { untilId: cursor } : {}),
  };
  if (source.kind === "search") {
    path = "notes/search";
    params.query = source.query;
  }
  if (source.kind === "list") {
    path = "notes/user-list-timeline";
    params.listId = source.target;
  }
  if (source.kind === "user") {
    const [username, host] = String(source.target).replace(/^@/, "").split("@");
    const { data } = await misskeyRequest(a, "users/show", {
      username,
      ...(host && host !== new URL(a.origin).host ? { host } : {}),
    });
    path = "users/notes";
    params.userId = data.id;
  }
  const { data } = await misskeyRequest(a, path, params);
  return {
    posts: data.map((p: any) => mapMisskey(p, a)),
    nextCursor: data.length === 30 ? data.at(-1).id : undefined,
  };
}
export async function misskeyNotifications(
  a: StoredAccount,
): Promise<Notification[]> {
  const { data } = await misskeyRequest(a, "i/notifications", { limit: 30 });
  return data
    .filter((n: any) => n.user)
    .map((n: any) => ({
      id: n.id,
      reason: n.type,
      createdAt: n.createdAt,
      author: {
        name: n.user.name || n.user.username,
        handle: n.user.username,
        avatarUrl: webUrl(n.user.avatarUrl),
      },
      post: n.note ? mapMisskey(n.note, a) : undefined,
    }));
}
