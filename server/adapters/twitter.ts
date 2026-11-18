import { TwitterClient, type TweetData } from "@yuta/bird";
import { mapTwitterPost } from "../imported/twitter";
import type { StoredAccount } from "../store";
import type { FeedPage, FeedSource, SocialPost } from "../../src/domain/model";
import { jsonRequest } from "../http";
const clients = new Map<string, TwitterClient>();
export function twitterClient(account: StoredAccount) {
  const existing = clients.get(account.profile!);
  if (existing) return existing;
  const client = new TwitterClient({
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
  } else result = await client.getHomeLatestTimeline(30, options);
  if (!result.success) throw new Error("Could not load X. Check the relay and selected profile.");
  return {
    posts: result.tweets.map((p) => twitterPost(p, account)),
    nextCursor: result.nextCursor,
  };
}
