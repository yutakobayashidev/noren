import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { publicOrigin, publicJson } from "./http";
import { identityKey } from "./auth";
import { type AccountStore, type StoredAccount } from "./store";
import { webUrl } from "./adapters/mastodon";
type Flow = {
  owner: string;
  expires: number;
  origin: string;
  clientId?: string;
  clientSecret?: string;
  verifier?: string;
  platform: "mastodon" | "misskey";
};
export function connectionRouter(request = publicJson, validateOrigin = publicOrigin) {
  const router = Router();
  const flows = new Map<string, Flow>();
  function callback(platform: string) {
    return new URL(
      `/api/connect/${platform}/callback`,
      process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`,
    ).href;
  }
  router.post("/:platform", async (req, res) => {
    const platform = z.enum(["mastodon", "misskey"]).parse(req.params.platform);
    const origin = await validateOrigin(
      z.object({ origin: z.string().max(300) }).parse(req.body).origin,
    );
    for (const [id, flow] of flows) if (flow.expires < Date.now()) flows.delete(id);
    if (flows.size >= 1000) throw new Error("Too many pending sign-ins. Try again later.");
    const state = crypto.randomUUID();
    const flow: Flow = {
      owner: identityKey(res.locals.identity),
      expires: Date.now() + 600000,
      origin,
      platform,
    };
    let target: URL;
    if (platform === "mastodon") {
      const { data } = await request(new URL("/api/v1/apps", origin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Flare Web",
          redirect_uris: callback(platform),
          scopes: "read write follow",
        }),
      });
      flow.clientId = z.string().parse(data.client_id);
      flow.clientSecret = z.string().parse(data.client_secret);
      flow.verifier = randomBytes(32).toString("base64url");
      target = new URL("/oauth/authorize", origin);
      target.search = new URLSearchParams({
        client_id: flow.clientId,
        redirect_uri: callback(platform),
        response_type: "code",
        scope: "read write follow",
        state,
        code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
    } else {
      target = new URL(`/miauth/${state}`, origin);
      target.search = new URLSearchParams({
        name: "Flare Web",
        callback: callback(platform),
        permission:
          "read:account,read:notifications,write:notes,write:reactions,read:reactions,read:following",
      }).toString();
    }
    flows.set(state, flow);
    res.json({ url: target.href });
  });
  router.get("/:platform/callback", async (req, res) => {
    const state = z.string().parse(req.query.state ?? req.query.session);
    const flow = flows.get(state);
    if (
      !flow ||
      flow.expires < Date.now() ||
      flow.owner !== identityKey(res.locals.identity) ||
      flow.platform !== req.params.platform
    )
      throw new Error("Connection expired. Start again from Accounts.");
    flows.delete(state);
    if (req.query.error) {
      res.redirect("/?connectionError=cancelled");
      return;
    }
    let account: StoredAccount;
    if (flow.platform === "mastodon") {
      const code = z.string().parse(req.query.code);
      const { data } = await request(new URL("/oauth/token", flow.origin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          client_id: flow.clientId,
          client_secret: flow.clientSecret,
          redirect_uri: callback(flow.platform),
          code_verifier: flow.verifier,
        }),
      });
      const token = z.string().min(1).parse(data.access_token);
      const { data: user } = await request(
        new URL("/api/v1/accounts/verify_credentials", flow.origin),
        { headers: { authorization: `Bearer ${token}` } },
      );
      account = {
        id: `mastodon:${new URL(flow.origin).host}:${user.id}`,
        platform: "mastodon",
        origin: flow.origin,
        displayName: user.display_name || user.username,
        handle: user.acct,
        avatarUrl: webUrl(user.avatar),
        token,
        canPost: true,
      };
    } else {
      const { data } = await request(new URL(`/api/miauth/${state}/check`, flow.origin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!data.ok || !data.token || !data.user)
        throw new Error("Misskey authorization was not completed.");
      const user = data.user;
      account = {
        id: `misskey:${new URL(flow.origin).host}:${user.id}`,
        platform: "misskey",
        origin: flow.origin,
        displayName: user.name || user.username,
        handle: user.username,
        avatarUrl: webUrl(user.avatarUrl),
        token: data.token,
        canPost: true,
      };
    }
    (res.locals.store as AccountStore).put(account);
    res.redirect("/?connected=" + flow.platform);
  });
  return router;
}
