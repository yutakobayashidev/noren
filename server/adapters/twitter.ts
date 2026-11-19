import { TwitterClient, type CurrentUserResult, type TweetData } from "@yuta/bird";
import { mapTwitterPost } from "../imported/twitter";
import type { StoredAccount } from "../store";
import type { FeedPage, FeedSource, SocialPost } from "../../src/domain/model";
import { jsonRequest } from "../http";
import { webUrl } from "./mastodon";
class RelayTwitterClient extends TwitterClient {
  override async getCurrentUser(): Promise<CurrentUserResult & { avatarUrl?: string }> {
    const options = { headers: this.getHeaders(), signal: AbortSignal.timeout(20000) };
    const catalog = await fetch(new URL("/requests.ndjson", this.relayBaseUrl), options);
    if (catalog.status === 404) return super.getCurrentUser();
    if (!catalog.ok) throw new Error("Could not read the X relay request catalog.");

    for (const line of (await catalog.text()).split("\n")) {
      if (!line.includes("/Viewer")) continue;
      const entry = JSON.parse(line);
      if (entry.method !== "GET" || !/^\/graphql\/[\w-]+\/Viewer$/.test(entry.path)) continue;
      const url = new URL("/i/api" + entry.path, this.relayBaseUrl);
      for (const key of ["variables", "features", "fieldToggles"]) {
        if (typeof entry.params?.[key] === "string") url.searchParams.set(key, entry.params[key]);
      }
      const response = await fetch(url, options);
      if (!response.ok) throw new Error("The X relay could not load the selected profile.");
      const user = (await response.json()).data?.viewer?.user_results?.result;
      const username = user?.core?.screen_name ?? user?.legacy?.screen_name;
      if (
        typeof username !== "string" ||
        !username ||
        typeof user?.rest_id !== "string" ||
        !user.rest_id
      )
        throw new Error("Sign in to X in the browser for this relay profile, then try again.");
      this.clientUserId = user.rest_id;
      return {
        success: true,
        avatarUrl: webUrl(user.avatar?.image_url ?? user.legacy?.profile_image_url_https),
        user: {
          id: user.rest_id,
          username,
          name: user.core?.name || user.legacy?.name || username,
        },
      };
    }
    return super.getCurrentUser();
  }
}
const clients = new Map<string, RelayTwitterClient>();
export function twitterClient(account: StoredAccount) {
  const existing = clients.get(account.profile!);
  if (existing) return existing;
  const client = new RelayTwitterClient({
    relayBaseUrl: process.env.TWITTER_RELAY_BASE_URL,
    profileName: account.profile,
    timeoutMs: 20000,
  });
  clients.set(account.profile!, client);
  return client;
}
export async function twitterProfiles(): Promise<string[]> {
  const origin = process.env.TWITTER_RELAY_BASE_URL;
  if (!origin) return [];
  const { data } = await jsonRequest(new URL("/profiles", origin));
  if (!Array.isArray(data.profiles) || data.profiles.some((p: unknown) => typeof p !== "string"))
    throw new Error("The relay returned invalid profiles.");
  return data.profiles;
}
export function twitterPost(post: TweetData, account: StoredAccount): SocialPost {
  const mapped = mapTwitterPost(post);
  return {
    ...mapped,
    replyToId: post.inReplyToStatusId,
    accountId: account.id,
    likes: post.likeCount,
    reposts: post.retweetCount,
    replies: post.replyCount,
    quotedPost: post.quotedTweet ? twitterPost(post.quotedTweet, account) : undefined,
  };
}
export async function twitterFeed(
  account: StoredAccount,
  source: FeedSource,
  cursor?: string,
): Promise<FeedPage> {
  const client = twitterClient(account);
  const options = { cursor, maxPages: 1 };
  let result;
  if (source.kind === "search")
    result = await client.getAllSearchResults(source.query || "", {
      ...options,
      product: "Latest",
    });
  else if (source.kind === "list")
    result = await client.getAllListTimeline(source.target || "", options);
  else if (source.kind === "user") {
    const user = await client.getUserIdByUsername(source.target || account.handle);
    if (!user.success || !user.userId) throw new Error("X profile not found.");
    result = await client.getUserTweetsPaged(user.userId, 30, {
      ...options,
      pageDelayMs: 0,
    });
  } else if (source.kind === "recommended") result = await client.getHomeTimeline(30, options);
  else result = await client.getHomeLatestTimeline(30, options);
  if (!result.success) throw new Error("Could not load X. Check the relay and selected profile.");
  return {
    posts: result.tweets.map((p) => twitterPost(p, account)),
    nextCursor: result.nextCursor,
  };
}
