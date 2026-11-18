import { Agent } from "@atproto/api";
import {
  NodeOAuthClient,
  requestLocalLock,
  type NodeSavedSession,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { Router } from "express";
import { z } from "zod";
import { publicFetch } from "./http";
import type { AccountStore } from "./store";

const scope = "atproto transition:generic";
export function blueskyMetadata() {
  const origin = new URL(
    process.env.APP_ORIGIN || "http://localhost:" + (process.env.PORT || 3000),
  );
  const callback = new URL("/api/connect/bluesky/callback", origin).href;
  const loopback = origin.protocol === "http:" && origin.hostname === "127.0.0.1";
  if (!loopback && origin.protocol !== "https:")
    throw new Error(
      "Bluesky OAuth requires an HTTPS app URL or http://127.0.0.1 for local development.",
    );
  return {
    client_id: loopback
      ? "http://localhost?" + new URLSearchParams({ redirect_uri: callback, scope })
      : new URL("/bluesky-client.json", origin).href,
    client_name: "Flare Web",
    client_uri: origin.origin,
    redirect_uris: [callback] as [string],
    scope,
    application_type: loopback ? ("native" as const) : ("web" as const),
    grant_types: ["authorization_code", "refresh_token"] as ["authorization_code", "refresh_token"],
    response_types: ["code"] as ["code"],
    dpop_bound_access_tokens: true as const,
    token_endpoint_auth_method: "none" as const,
  };
}
const clients = new WeakMap<AccountStore, NodeOAuthClient>();
export function blueskyOAuth(store: AccountStore) {
  const existing = clients.get(store);
  if (existing) return existing;
  const states = new Map<string, { value: NodeSavedState; expires: number }>();
  const client = new NodeOAuthClient({
    clientMetadata: blueskyMetadata(),
    requestLock: requestLocalLock,
    fetch: publicFetch,
    stateStore: {
      async set(key, value) {
        for (const [id, s] of states) if (s.expires < Date.now()) states.delete(id);
        if (states.size >= 32) throw new Error("Too many pending sign-ins.");
        states.set(key, { value, expires: Date.now() + 600000 });
      },
      async get(key) {
        const s = states.get(key);
        return s && s.expires > Date.now() ? s.value : undefined;
      },
      async del(key) {
        states.delete(key);
      },
    },
    sessionStore: {
      async get(did) {
        const a = store.all().find((a) => a.id === "bluesky:" + did);
        return a?.oauthSession as NodeSavedSession | undefined;
      },
      async set(did, value) {
        const id = "bluesky:" + did;
        const previous = store.all().find((a) => a.id === id);
        store.put({
          id,
          platform: "bluesky",
          origin: "https://bsky.social",
          canPost: true,
          displayName: previous?.displayName || did,
          handle: previous?.handle || did,
          avatarUrl: previous?.avatarUrl,
          oauthSession: value,
        });
      },
      async del(did) {
        const id = "bluesky:" + did;
        if (store.all().some((a) => a.id === id && a.oauthSession)) store.remove(id);
      },
    },
  });
  clients.set(store, client);
  return client;
}
export function blueskyConnectionRouter() {
  const router = Router();
  router.post("/", async (req, res) => {
    const handle = z
      .string()
      .trim()
      .regex(/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/i)
      .max(253)
      .parse(req.body.identifier);
    const url = await blueskyOAuth(res.locals.store).authorize(handle, {
      scope,
    });
    res.json({ url: url.href });
  });
  router.get("/callback", async (req, res) => {
    const store: AccountStore = res.locals.store;
    const { session } = await blueskyOAuth(store).callback(
      new URL(req.originalUrl, "http://localhost").searchParams,
    );
    const { data } = await new Agent(session).getProfile({
      actor: session.did,
    });
    store.put({
      ...store.get("bluesky:" + session.did),
      displayName: data.displayName || data.handle,
      handle: data.handle,
      avatarUrl: data.avatar,
    });
    res.redirect("/?connected=bluesky");
  });
  return router;
}
