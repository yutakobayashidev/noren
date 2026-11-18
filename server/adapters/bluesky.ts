import { blueskyOAuth } from "../bluesky-oauth";
import { Agent, BskyAgent, RichText, type AtpSessionData } from "@atproto/api";
import type { StoredAccount, AccountStore } from "../store";
import type { SocialPost, FeedSource, FeedPage, Notification } from "../../src/domain/model";
import { webUrl } from "./mastodon";
import { publicFetch } from "../http";

// Port of Flare's BlueskyDataSource: session, timeline cursor, post URI/CID and viewer actions.
export function mapBluesky(post: any, account: StoredAccount, reason?: any): SocialPost {
  const embed = post.embed;
  const media = embed?.images ?? embed?.media?.images ?? [];
  const quoted =
    embed?.record?.record ??
    (embed?.record?.$type?.endsWith("viewRecord") ? embed.record : undefined);
  return {
    key: `bluesky:${post.uri}`,
    nativeId: post.uri,
    replyToId: post.record?.reply?.parent?.uri,
    cid: post.cid,
    accountId: account.id,
    platform: "bluesky",
    url: `https://bsky.app/profile/${encodeURIComponent(post.author.handle)}/post/${encodeURIComponent(post.uri.split("/").pop())}`,
    text: post.record?.text ?? post.value?.text ?? "",
    author: {
      name: post.author.displayName || post.author.handle,
      handle: post.author.handle,
      avatarUrl: webUrl(post.author.avatar),
    },
    createdAt: post.record?.createdAt ?? post.indexedAt,
    likes: post.likeCount,
    reposts: post.repostCount,
    replies: post.replyCount,
    liked: !!post.viewer?.like,
    reposted: !!post.viewer?.repost,
    likeUri: post.viewer?.like,
    repostUri: post.viewer?.repost,
    sensitive: post.labels?.some((l: any) => ["porn", "sexual", "graphic-media"].includes(l.val)),
    media: media
      .map((m: any) => ({
        type: "photo",
        url: webUrl(m.fullsize) || "",
        previewUrl: webUrl(m.thumb),
        alt: m.alt || "",
      }))
      .filter((m: any) => m.url),
    boostedBy: reason?.by
      ? {
          name: reason.by.displayName || reason.by.handle,
          handle: reason.by.handle,
        }
      : undefined,
    quotedPost: quoted?.author
      ? mapBluesky({ ...quoted, record: quoted.value }, account)
      : undefined,
  };
}
const stores = new WeakMap<AccountStore, Map<string, BskyAgent>>();
export function forgetBluesky(id: string, store: AccountStore) {
  stores.get(store)?.delete(id);
}
export async function blueskyAgent(account: StoredAccount, store: AccountStore) {
  if (account.oauthSession)
    return new Agent(await blueskyOAuth(store).restore(account.id.slice("bluesky:".length)));
  let agents = stores.get(store);
  if (!agents) {
    agents = new Map();
    stores.set(store, agents);
  }
  let agent = agents.get(account.id);
  if (agent) return agent;
  agent = new BskyAgent({
    service: account.origin,
    fetch: publicFetch,
    persistSession: (_event, session) => {
      if (session) store.put({ ...account, session });
    },
  });
  await agent.resumeSession(account.session as AtpSessionData);
  agents.set(account.id, agent);
  return agent;
}
export async function blueskyFeed(
  account: StoredAccount,
  store: AccountStore,
  source: FeedSource,
  cursor?: string,
): Promise<FeedPage> {
  const agent = await blueskyAgent(account, store);
  if (source.kind === "search") {
    const { data } = await agent.app.bsky.feed.searchPosts({
      q: source.query || "",
      sort: "latest",
      limit: 30,
      cursor,
    });
    return {
      posts: data.posts.map((p) => mapBluesky(p, account)),
      nextCursor: data.cursor,
    };
  }
  const { data } =
    source.kind === "user"
      ? await agent.getAuthorFeed({
          actor: source.target || account.handle,
          limit: 30,
          cursor,
        })
      : source.kind === "list"
        ? await agent.app.bsky.feed.getListFeed({
            list: source.target || "",
            limit: 30,
            cursor,
          })
        : await agent.getTimeline({ limit: 30, cursor });
  return {
    posts: data.feed.map((item) => mapBluesky(item.post, account, item.reason)),
    nextCursor: data.cursor,
  };
}
export async function blueskyPublish(
  account: StoredAccount,
  store: AccountStore,
  text: string,
  reply?: SocialPost,
) {
  const agent = await blueskyAgent(account, store);
  const rich = new RichText({ text });
  await rich.detectFacets(agent);
  let replyRecord;
  if (reply) {
    const { data } = await agent.getPostThread({
      uri: reply.nativeId,
      depth: 0,
    });
    const thread = data.thread as any;
    if (!thread.post) throw new Error("The parent post is unavailable.");
    const parent = { uri: reply.nativeId, cid: thread.post.cid };
    replyRecord = { parent, root: thread.post.record?.reply?.root ?? parent };
  }
  return agent.post({
    text: rich.text,
    facets: rich.facets,
    reply: replyRecord,
  });
}
export async function blueskyNotifications(
  account: StoredAccount,
  store: AccountStore,
): Promise<Notification[]> {
  const agent = await blueskyAgent(account, store);
  const { data } = await agent.listNotifications({ limit: 30 });
  return data.notifications.map((n) => ({
    id: n.uri,
    reason: n.reason,
    createdAt: n.indexedAt,
    author: {
      name: n.author.displayName || n.author.handle,
      handle: n.author.handle,
      avatarUrl: webUrl(n.author.avatar),
    },
  }));
}
