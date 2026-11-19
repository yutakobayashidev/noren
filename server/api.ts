import { profileLinks } from "./profile-links";
import { blueskyConnectionRouter } from "./bluesky-oauth";
import { nostrRouter, nostrFeed, nostrThread, publishNostr, signedEvent } from "./adapters/nostr";
import { connectionRouter } from "./connections";
import { Router } from "express";
import { misskeyFeed, misskeyRequest, mapMisskey, misskeyNotifications } from "./adapters/misskey";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { BskyAgent } from "@atproto/api";
import { AccountStore, type StoredAccount } from "./store";
import { identityKey } from "./auth";
import { publicOrigin, publicFetch } from "./http";
import {
  mastodonFeed,
  mastodonRequest,
  mapMastodon,
  mastodonNotifications,
} from "./adapters/mastodon";
import {
  blueskyAgent,
  blueskyFeed,
  blueskyPublish,
  blueskyNotifications,
  mapBluesky,
  forgetBluesky,
} from "./adapters/bluesky";
import { twitterProfiles, twitterClient, twitterFeed, twitterPost } from "./adapters/twitter";
import { supportsRecommended, type SocialPost } from "../src/domain/model";

const sourceSchema = z.object({
  kind: z.enum(["home", "recommended", "search", "user", "list"]),
  query: z.string().max(1000).optional(),
  target: z.string().max(1000).optional(),
});
const postSchema = z.object({
  accountId: z.string(),
  nativeId: z.string().min(1).max(2000),
  cid: z.string().optional(),
  likeUri: z.string().optional(),
  repostUri: z.string().optional(),
});
const guest: StoredAccount = {
  id: "guest",
  platform: "mastodon",
  displayName: "Mastodon",
  handle: "Trending posts",
  origin: "https://mastodon.social",
  canPost: false,
};
const stores = new Map<string, AccountStore>();
export function apiRouter() {
  const router = Router();
  router.use((req, res, next) => {
    if (
      res.locals.preview &&
      !(
        (req.method === "GET" && req.path === "/accounts") ||
        (req.method === "POST" &&
          ["/timeline", "/thread", "/profile-links"].includes(req.path) &&
          req.body?.accountId === "guest")
      )
    ) {
      res.status(403).json({
        error: "This preview is read-only. Sign in with OIDC to connect accounts.",
      });
      return;
    }
    next();
  });
  router.use((_req, res, next) => {
    const id = identityKey(res.locals.identity);
    let store = stores.get(id);
    if (!store) {
      store = new AccountStore(join(process.env.FLARE_DATA_DIR || ".data", "users", id));
      stores.set(id, store);
    }
    res.locals.store = store;
    next();
  });
  router.use("/nostr", nostrRouter());
  router.use("/connect/bluesky", blueskyConnectionRouter());
  router.use("/connect", connectionRouter());
  router.get("/accounts", (_req, res) => res.json({ accounts: res.locals.store.public(), guest }));
  router.get("/accounts/:id/avatar", async (req, res) => {
    const store: AccountStore = res.locals.store;
    const account = store.get(req.params.id);
    if (account.platform !== "twitter") return res.sendStatus(404);
    if (account.avatarUrl) return res.redirect(account.avatarUrl);
    const viewer = await twitterClient(account).getCurrentUser();
    if (!viewer.avatarUrl || viewer.user?.username.toLowerCase() !== account.handle.toLowerCase())
      return res.sendStatus(404);
    store.setAvatar(account, viewer.avatarUrl);
    res.redirect(viewer.avatarUrl);
  });
  router.get("/twitter/profiles", async (_req, res) =>
    res.json({ profiles: await twitterProfiles() }),
  );
  router.post("/accounts", async (req, res) => {
    const input = z
      .discriminatedUnion("platform", [
        z.object({
          platform: z.literal("mastodon"),
          origin: z.string().max(300),
          token: z.string().min(1).max(4000),
        }),
        z.object({
          platform: z.literal("bluesky"),
          origin: z.string().max(300).default("https://bsky.social"),
          identifier: z.string().min(1).max(300),
          password: z.string().min(1).max(1000),
        }),
        z.object({
          platform: z.literal("twitter"),
          profile: z.string().min(1).max(300),
        }),
      ])
      .parse(req.body);
    const store: AccountStore = res.locals.store;
    let account: StoredAccount;
    if (input.platform === "mastodon") {
      const origin = await publicOrigin(input.origin);
      const provisional = {
        id: randomUUID(),
        origin,
        token: input.token,
        platform: "mastodon" as const,
        displayName: "",
        handle: "",
        canPost: true,
      };
      const { data } = await mastodonRequest(provisional, "/api/v1/accounts/verify_credentials");
      account = {
        ...provisional,
        id: `mastodon:${new URL(origin).host}:${data.id}`,
        displayName: data.display_name || data.username,
        handle: data.acct,
        avatarUrl: data.avatar,
      };
    } else if (input.platform === "bluesky") {
      const origin = await publicOrigin(input.origin);
      const agent = new BskyAgent({ service: origin, fetch: publicFetch });
      const { data } = await agent.login({
        identifier: input.identifier,
        password: input.password,
      });
      const { data: profile } = await agent.getProfile({ actor: data.did });
      account = {
        id: `bluesky:${data.did}`,
        platform: "bluesky",
        origin,
        displayName: profile.displayName || data.handle,
        handle: data.handle,
        avatarUrl: profile.avatar,
        session: agent.session,
        canPost: true,
      };
    } else {
      if (!(await twitterProfiles()).includes(input.profile))
        throw new Error("Select a relay profile.");
      account = {
        id: `twitter:${input.profile}`,
        platform: "twitter",
        profile: input.profile,
        origin: new URL(process.env.TWITTER_RELAY_BASE_URL!).origin,
        displayName: input.profile,
        handle: input.profile,
        canPost: true,
      };
      const result = await twitterClient(account).getCurrentUser();
      if (!result.success || !result.user)
        throw new Error("Could not sign in with this relay profile.");
      account = {
        ...account,
        displayName: result.user.name,
        handle: result.user.username,
        avatarUrl: result.avatarUrl,
      };
    }
    store.put(account);
    res.json({ accounts: store.public() });
  });
  router.delete("/accounts/:id", (req, res) => {
    const store: AccountStore = res.locals.store;
    forgetBluesky(String(req.params.id), store);
    store.remove(String(req.params.id));
    res.json({ accounts: store.public() });
  });
  router.post("/timeline", async (req, res) => {
    const { accountId, source, cursor } = z
      .object({
        accountId: z.string(),
        source: sourceSchema,
        cursor: z.string().max(4000).optional(),
      })
      .parse(req.body);
    const store: AccountStore = res.locals.store;
    const account = accountId === "guest" ? guest : store.get(accountId);
    if (source.kind === "recommended" && !supportsRecommended(account.platform))
      throw new Error("Recommended timelines are available for X accounts only.");
    if (account.platform === "misskey") {
      res.json(await misskeyFeed(account, source, cursor));
      return;
    }
    if (account.platform === "nostr") {
      res.json(await nostrFeed(account, source, cursor));
      return;
    }
    const page =
      account.platform === "twitter"
        ? await twitterFeed(account, source, cursor)
        : account.platform === "bluesky"
          ? await blueskyFeed(account, store, source, cursor)
          : await mastodonFeed(account, source, cursor);
    res.json(page);
  });
  router.get("/notifications", async (req, res) => {
    const store: AccountStore = res.locals.store;
    const account = store.get(z.string().parse(req.query.accountId));
    if (account.platform === "misskey") {
      res.json({ notifications: await misskeyNotifications(account) });
      return;
    }
    if (account.platform === "twitter" || account.platform === "nostr") {
      res.json({ notifications: [], unsupported: true });
      return;
    }
    res.json({
      notifications:
        account.platform === "bluesky"
          ? await blueskyNotifications(account, store)
          : await mastodonNotifications(account),
    });
  });
  router.post("/profile-links", async (req, res) => {
    const { accountId, handle } = z
      .object({ accountId: z.string(), handle: z.string().min(1).max(512) })
      .parse(req.body);
    const store: AccountStore = res.locals.store;
    res.json({
      links: await profileLinks(
        accountId === "guest" ? guest : store.get(accountId),
        handle,
        store,
      ),
    });
  });
  router.post("/thread", async (req, res) => {
    const input = postSchema.parse(req.body);
    const store: AccountStore = res.locals.store;
    const account = input.accountId === "guest" ? guest : store.get(input.accountId);
    if (account.platform === "nostr") {
      res.json({ posts: await nostrThread(account, input.nativeId) });
      return;
    }
    if (account.platform === "misskey") {
      const params = { noteId: input.nativeId };
      const [ancestors, note, replies] = await Promise.all(
        ["notes/conversation", "notes/show", "notes/replies"].map((path) =>
          misskeyRequest(account, path, params),
        ),
      );
      res.json({
        posts: [...ancestors.data.reverse(), note.data, ...replies.data].map((n) =>
          mapMisskey(n, account),
        ),
      });
      return;
    }
    if (account.platform === "mastodon") {
      const path = `/api/v1/statuses/${encodeURIComponent(input.nativeId)}`;
      const [{ data: post }, { data: context }] = await Promise.all([
        mastodonRequest(account, path),
        mastodonRequest(account, `${path}/context`),
      ]);
      res.json({
        posts: [...context.ancestors, post, ...context.descendants].map((p) =>
          mapMastodon(p, account),
        ),
      });
    } else if (account.platform === "bluesky") {
      const agent = await blueskyAgent(account, store);
      const { data } = await agent.getPostThread({
        uri: input.nativeId,
        depth: 6,
        parentHeight: 20,
      });
      const result: SocialPost[] = [];
      const parents = (t: any) => {
        if (t.parent) parents(t.parent);
        if (t.post) result.push(mapBluesky(t.post, account));
      };
      const replies = (t: any) => {
        for (const reply of t.replies || []) {
          if (reply.post) result.push(mapBluesky(reply.post, account));
          replies(reply);
        }
      };
      parents(data.thread);
      replies(data.thread);
      res.json({ posts: result });
    } else {
      const result = await twitterClient(account).getThread(input.nativeId);
      if (!result.success) throw new Error("Could not load the thread.");
      res.json({ posts: result.tweets.map((p) => twitterPost(p, account)) });
    }
  });
  router.post("/action", async (req, res) => {
    const input = postSchema
      .extend({ action: z.enum(["like", "unlike", "repost", "unrepost"]) })
      .parse(req.body);
    const store: AccountStore = res.locals.store;
    const account = store.get(input.accountId);
    if (account.platform === "nostr") throw new Error("Nostr reactions are unavailable.");
    if (!account.canPost) throw new Error("This feed is read-only.");
    if (account.platform === "misskey") {
      const path = {
        like: "notes/reactions/create",
        unlike: "notes/reactions/delete",
        repost: "notes/create",
        unrepost: "notes/unrenote",
      }[input.action];
      await misskeyRequest(
        account,
        path,
        input.action === "repost"
          ? { renoteId: input.nativeId }
          : {
              noteId: input.nativeId,
              ...(input.action === "like" ? { reaction: "❤️" } : {}),
            },
      );
      res.json({ ok: true });
      return;
    }
    if (account.platform === "mastodon") {
      const actions = {
        like: "favourite",
        unlike: "unfavourite",
        repost: "reblog",
        unrepost: "unreblog",
      };
      const { data } = await mastodonRequest(
        account,
        `/api/v1/statuses/${encodeURIComponent(input.nativeId)}/${actions[input.action]}`,
        {},
      );
      res.json({ post: mapMastodon(data, account) });
    } else if (account.platform === "bluesky") {
      const agent = await blueskyAgent(account, store);
      if (input.action === "like" || input.action === "repost") {
        if (!input.cid) throw new Error("Missing post revision. Refresh the timeline.");
        const result =
          input.action === "like"
            ? await agent.like(input.nativeId, input.cid)
            : await agent.repost(input.nativeId, input.cid);
        res.json({ uri: result.uri });
      } else {
        const uri = input.action === "unlike" ? input.likeUri : input.repostUri;
        if (!uri || !uri.startsWith(`at://${agent.assertDid}/`))
          throw new Error("Refresh the timeline before undoing this action.");
        if (input.action === "unlike") await agent.deleteLike(uri);
        else await agent.deleteRepost(uri);
        res.json({ ok: true });
      }
    } else {
      const client = twitterClient(account);
      const result = await {
        like: () => client.like(input.nativeId),
        unlike: () => client.unlike(input.nativeId),
        repost: () => client.retweet(input.nativeId),
        unrepost: () => client.unretweet(input.nativeId),
      }[input.action]();
      if (!result.success) throw new Error("X could not complete this action.");
      res.json({ ok: true });
    }
  });
  router.post("/publish", async (req, res) => {
    const input = z
      .object({
        accountIds: z.array(z.string()).min(1).max(10),
        text: z.string().trim().max(10000),
        variants: z
          .record(
            z.string(),
            z.object({
              text: z.string().trim().max(10000).optional(),
              warning: z.string().max(500).optional(),
            }),
          )
          .optional(),
        reply: postSchema.optional(),
        signedEvents: z.record(z.string(), signedEvent).optional(),
      })
      .parse(req.body);
    const store: AccountStore = res.locals.store;
    const accounts = [...new Set(input.accountIds)].map((id) => store.get(id));
    if (input.reply && (accounts.length !== 1 || accounts[0].id !== input.reply.accountId))
      throw new Error("Replies use the account that opened the post.");
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const variant = input.variants?.[account.id];
          const body = variant?.text ?? input.text;
          if (!body.trim()) throw new Error("Post text required");
          if (!account.canPost) throw new Error("This feed is read-only.");
          if (account.platform === "nostr") {
            await publishNostr(
              account,
              input.signedEvents?.[account.id],
              body,
              input.reply?.nativeId,
            );
            return { accountId: account.id, ok: true };
          }
          const limit =
            account.platform === "bluesky" ? 300 : account.platform === "twitter" ? 280 : 500;
          if (
            [
              ...new Intl.Segmenter(undefined, {
                granularity: "grapheme",
              }).segment(body),
            ].length > limit
          )
            throw new Error(`This account supports up to ${limit} characters.`);
          if (account.platform === "mastodon")
            await mastodonRequest(account, "/api/v1/statuses", {
              status: body,
              visibility: "public",
              spoiler_text: variant?.warning,
              in_reply_to_id: input.reply?.nativeId,
            });
          else if (account.platform === "misskey")
            await misskeyRequest(account, "notes/create", {
              text: body,
              replyId: input.reply?.nativeId,
            });
          else if (account.platform === "bluesky")
            await blueskyPublish(account, store, body, input.reply as SocialPost | undefined);
          else {
            const client = twitterClient(account);
            const result = input.reply
              ? await client.reply(body, input.reply.nativeId)
              : await client.tweet(body);
            if (!result.success) throw new Error("X could not publish this post.");
          }
          return { accountId: account.id, ok: true };
        } catch (error) {
          return {
            accountId: account.id,
            ok: false,
            error: error instanceof Error ? error.message : "Could not publish.",
          };
        }
      }),
    );
    res.json({ results });
  });
  router.get("/lists", async (req, res) => {
    const store: AccountStore = res.locals.store;
    const account = store.get(z.string().parse(req.query.accountId));
    if (account.platform === "nostr") {
      res.json({ lists: [] });
      return;
    }
    if (account.platform === "mastodon") {
      const { data } = await mastodonRequest(account, "/api/v1/lists");
      res.json({ lists: data.map((l: any) => ({ id: l.id, title: l.title })) });
    } else if (account.platform === "bluesky") {
      const agent = await blueskyAgent(account, store);
      const { data } = await agent.app.bsky.graph.getLists({
        actor: agent.assertDid,
        limit: 100,
      });
      res.json({
        lists: data.lists.map((l) => ({ id: l.uri, title: l.name })),
      });
    } else if (account.platform === "misskey") {
      const { data } = await misskeyRequest(account, "users/lists/list");
      res.json({ lists: data.map((l: any) => ({ id: l.id, title: l.name })) });
    } else {
      const data = await twitterClient(account).getLists(100);
      if (!data.success) throw new Error("Could not load lists.");
      res.json({
        lists: data.lists?.map((l) => ({ id: l.id, title: l.name })) ?? [],
      });
    }
  });
  return router;
}
