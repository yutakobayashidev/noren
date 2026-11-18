import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createAuth } from "../server/auth";
const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`),
    ),
  );
const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });
test("OIDC authorization code flow validates PKCE, state, nonce and session; guards API and logout", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "test",
    use: "sig",
    alg: "RS256",
  };
  const provider = express();
  provider.use(express.urlencoded({ extended: false }));
  const idp = createServer(provider);
  const issuer = await listen(idp);
  const codes = new Map<string, { challenge: string; nonce: string; redirect: string }>();
  let incorrectNonce = false;
  provider.get("/.well-known/openid-configuration", (_req, res) =>
    res.json({
      issuer,
      authorization_endpoint: issuer + "/authorize",
      token_endpoint: issuer + "/token",
      jwks_uri: issuer + "/jwks",
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    }),
  );
  provider.get("/jwks", (_req, res) => res.json({ keys: [jwk] }));
  provider.get("/authorize", (req, res) => {
    assert.equal(req.query.code_challenge_method, "S256");
    const code = randomUUID();
    codes.set(code, {
      challenge: String(req.query.code_challenge),
      nonce: String(req.query.nonce),
      redirect: String(req.query.redirect_uri),
    });
    const target = new URL(String(req.query.redirect_uri));
    target.searchParams.set("code", code);
    target.searchParams.set("state", String(req.query.state));
    res.redirect(target.href);
  });
  provider.post("/token", async (req, res) => {
    const code = codes.get(req.body.code);
    codes.delete(req.body.code);
    if (
      !code ||
      req.body.client_secret !== "test-secret" ||
      createHash("sha256")
        .update(req.body.code_verifier || "")
        .digest("base64url") !== code.challenge ||
      req.body.redirect_uri !== code.redirect
    ) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    const token = await new SignJWT({
      nonce: incorrectNonce ? "wrong" : code.nonce,
      name: "Test user",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer(issuer)
      .setAudience("test-client")
      .setSubject("test-user")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    res.json({
      access_token: "test-access",
      token_type: "Bearer",
      expires_in: 300,
      id_token: token,
    });
  });
  const app = express();
  const server = createServer(app);
  const origin = await listen(server);
  Object.assign(process.env, {
    APP_ORIGIN: origin,
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "test-client",
    OIDC_CLIENT_SECRET: "test-secret",
    OIDC_ALLOW_HTTP: "1",
    FLARE_DATA_DIR: mkdtempSync(join(tmpdir(), "flare-auth-")),
    NODE_ENV: "test",
  });
  delete process.env.FLARE_DEV_AUTH;
  delete process.env.FLARE_PREVIEW;
  const auth = createAuth();
  app.use(auth.sameOrigin);
  app.use("/auth", auth.router);
  app.get("/api/private", auth.requireAuth, (_req, res) => res.json(res.locals.identity));
  app.use(
    (_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(400).json({ error: "Rejected" }),
  );
  const request = (url: string, cookie?: string) =>
    fetch(url, { redirect: "manual", headers: cookie ? { cookie } : {} });
  const login = async () => {
    const start = await request(origin + "/auth/login");
    assert.equal(start.status, 302);
    const flow = start.headers.getSetCookie()[0].split(";")[0];
    assert.match(start.headers.getSetCookie()[0], /HttpOnly/i);
    assert.match(start.headers.getSetCookie()[0], /SameSite=Lax/i);
    const authorization = await request(start.headers.get("location")!);
    return { flow, callback: authorization.headers.get("location")! };
  };
  try {
    assert.equal((await request(origin + "/api/private")).status, 401);
    const invalid = await login();
    const altered = new URL(invalid.callback);
    altered.searchParams.set("state", "wrong");
    assert.equal((await request(altered.href, invalid.flow)).status, 400);
    incorrectNonce = true;
    const wrongNonce = await login();
    assert.equal((await request(wrongNonce.callback, wrongNonce.flow)).status, 400);
    incorrectNonce = false;
    const valid = await login();
    const callback = await request(valid.callback, valid.flow);
    assert.equal(callback.status, 302);
    const cookie = callback.headers
      .getSetCookie()
      .find((c) => c.startsWith("flare_session="))!
      .split(";")[0];
    assert.ok(cookie);
    assert.ok(!cookie.includes("test-user"));
    assert.equal(
      (await request(valid.callback, valid.flow)).status,
      400,
      "authorization codes cannot be reused",
    );
    const identity = await request(origin + "/api/private", cookie);
    assert.equal(identity.status, 200);
    assert.equal((await identity.json()).sub, "test-user");
    assert.equal((await request(origin + "/api/private", cookie + "corrupted")).status, 401);
    assert.equal(
      (
        await fetch(origin + "/auth/logout", {
          method: "POST",
          headers: { cookie, origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const logout = await fetch(origin + "/auth/logout", {
      method: "POST",
      headers: { cookie, origin },
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/);
  } finally {
    await close(server);
    await close(idp);
  }
});
