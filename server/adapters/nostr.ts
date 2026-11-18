import { Router } from "express";
import { randomUUID } from "node:crypto";
import { verifyEvent, type Event, type EventTemplate } from "nostr-tools/pure";
import { SimplePool } from "nostr-tools/pool";
import { z } from "zod";
import { identityKey } from "../auth";
import type { StoredAccount } from "../store";
import type { FeedSource, SocialPost } from "../../src/domain/model";

const relays = ["wss://relay.damus.io", "wss://nos.lol"];
const pool = new SimplePool();
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const signedEvent = z.object({
  id: hex,
  pubkey: hex,
  sig: z.string().regex(/^[a-f0-9]{128}$/),
  kind: z.number().int(),
  created_at: z.number().int(),
  content: z.string(),
  tags: z.array(z.array(z.string())),
});
const now = () => Math.floor(Date.now() / 1000);
export function nostrRouter() {
  const router = Router();
  const pending = new Map<string, { expires: number; template: EventTemplate }>();
  router.post("/challenge", (_req, res) => {
    for (const [key, value] of pending) if (value.expires < now()) pending.delete(key);
    const template = {
      kind: 27235,
      created_at: now(),
      content: "",
      tags: [
        [
          "u",
          new URL(
            "/api/nostr/connect",
            process.env.APP_ORIGIN || "http://localhost:" + (process.env.PORT || 3000),
          ).href,
        ],
        ["method", "POST"],
        ["challenge", randomUUID()],
      ],
    };
    pending.set(identityKey(res.locals.identity), {
      template,
      expires: now() + 120,
    });
    res.json(template);
  });
  router.post("/connect", (req, res) => {
    const owner = identityKey(res.locals.identity);
    const challenge = pending.get(owner);
    const event = signedEvent.parse(req.body);
    if (
      !challenge ||
      challenge.expires < now() ||
      !verifyEvent(event) ||
      event.kind !== 27235 ||
      event.content !== "" ||
      event.created_at !== challenge.template.created_at ||
      JSON.stringify(event.tags) !== JSON.stringify(challenge.template.tags)
    )
      throw new Error("Nostr sign-in expired or invalid.");
    pending.delete(owner);
    res.locals.store.put({
      id: "nostr:" + event.pubkey,
      publicKey: event.pubkey,
      platform: "nostr",
      handle: event.pubkey,
      displayName: event.pubkey.slice(0, 12),
      origin: "https://njump.me",
      canPost: true,
    });
    res.json({ ok: true });
  });
  return router;
}
async function query(filter: Parameters<SimplePool["querySync"]>[1]) {
  return (await pool.querySync(relays, filter, { maxWait: 6000 })).sort(
    (a, b) => b.created_at - a.created_at,
  );
}
function post(event: Event, account: StoredAccount): SocialPost {
  return {
    platform: "nostr",
    key: "nostr:" + event.id,
    nativeId: event.id,
    accountId: account.id,
    text: event.content,
    url: "https://njump.me/" + event.id,
    author: { name: event.pubkey.slice(0, 12), handle: event.pubkey },
    createdAt: new Date(event.created_at * 1000).toISOString(),
  };
}
export async function nostrFeed(account: StoredAccount, source: FeedSource, cursor?: string) {
  let authors = [account.publicKey!];
  if (source.kind === "home") {
    const [contacts] = await query({ authors, kinds: [3], limit: 1 });
    authors = authors.concat(
      (contacts?.tags || [])
        .filter((t) => t[0] === "p" && hex.safeParse(t[1]).success)
        .slice(0, 1000)
        .map((t) => t[1]),
    );
  } else if (source.kind === "user") authors = [hex.parse(source.target)];
  else if (source.kind === "list") throw new Error("Nostr lists are unavailable.");
  const events = (
    await query({
      kinds: [1],
      limit: 30,
      ...(source.kind === "search" ? { search: source.query } : { authors }),
      ...(cursor ? { until: z.coerce.number().int().nonnegative().parse(cursor) } : {}),
    })
  ).slice(0, 30);
  return {
    posts: events.map((e) => post(e, account)),
    nextCursor: events.length === 30 ? String(events[29].created_at - 1) : undefined,
  };
}
export async function nostrThread(account: StoredAccount, id: string) {
  hex.parse(id);
  const [head, replies] = await Promise.all([
    query({ ids: [id], kinds: [1] }),
    query({ "#e": [id], kinds: [1], limit: 30 }),
  ]);
  return [...head, ...replies.reverse()].map((e) => post(e, account));
}
export async function publishNostr(
  account: StoredAccount,
  input: unknown,
  text: string,
  reply?: string,
) {
  const event = signedEvent.parse(input);
  if (
    !verifyEvent(event) ||
    event.pubkey !== account.publicKey ||
    event.kind !== 1 ||
    event.content !== text ||
    (reply && !event.tags.some((t) => t[0] === "e" && t[1] === reply))
  )
    throw new Error("The extension signed a different post or account.");
  await Promise.any(pool.publish(relays, event, { maxWait: 8000 }));
}
