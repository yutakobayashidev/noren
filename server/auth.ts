import * as oidc from "openid-client";
import { EncryptJWT, jwtDecrypt } from "jose";
import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Router, type Request, type Response, type NextFunction } from "express";

export type Identity = { sub: string; issuer: string; name: string };
export function identityKey(identity: Identity) {
  return createHash("sha256")
    .update(JSON.stringify([identity.issuer, identity.sub]))
    .digest("hex");
}
function cookie(req: Request, name: string) {
  return req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export function createAuth() {
  const origin = new URL(process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`);
  const secure = origin.protocol === "https:";
  if (
    !secure &&
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    !(
      process.env.FLARE_PREVIEW === "1" &&
      process.env.NODE_ENV !== "production" &&
      !process.env.OIDC_ISSUER
    )
  )
    throw new Error("APP_ORIGIN must use HTTPS outside localhost.");
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const dev = process.env.FLARE_DEV_AUTH === "1" && process.env.NODE_ENV !== "production";
  const preview = process.env.FLARE_PREVIEW === "1" && process.env.NODE_ENV !== "production";
  const directory = resolve(process.env.FLARE_DATA_DIR || ".data");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "session.key");
  if (!existsSync(path)) writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" });
  const key = readFileSync(path);
  let configuration: Promise<oidc.Configuration> | undefined;
  const config = () =>
    (configuration ??= (async () => {
      if (!issuer || !clientId) throw new Error("Configure OIDC_ISSUER and OIDC_CLIENT_ID.");
      const secret = process.env.OIDC_CLIENT_SECRET_FILE
        ? readFileSync(process.env.OIDC_CLIENT_SECRET_FILE, "utf8").trim()
        : process.env.OIDC_CLIENT_SECRET;
      const server = new URL(issuer);
      const allowTestHttp =
        process.env.OIDC_ALLOW_HTTP === "1" &&
        ["127.0.0.1", "localhost"].includes(server.hostname) &&
        process.env.NODE_ENV !== "production";
      const auth = secret
        ? process.env.OIDC_TOKEN_AUTH_METHOD === "client_secret_basic"
          ? oidc.ClientSecretBasic(secret)
          : oidc.ClientSecretPost(secret)
        : oidc.None();
      return oidc.discovery(
        server,
        clientId,
        undefined,
        auth,
        allowTestHttp ? { execute: [oidc.allowInsecureRequests] } : undefined,
      );
    })().catch((error) => {
      configuration = undefined;
      throw error;
    }));
  const seal = (value: Record<string, unknown>, aud: string, seconds: number) =>
    new EncryptJWT(value)
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setIssuer(origin.origin)
      .setAudience(aud)
      .setExpirationTime(`${seconds}s`)
      .encrypt(key);
  const read = async (req: Request, name: string) => {
    const value = cookie(req, name);
    if (!value) return null;
    try {
      return (await jwtDecrypt(value, key, { issuer: origin.origin, audience: name })).payload;
    } catch {
      return null;
    }
  };
  const set = (res: Response, name: string, value: string, seconds: number) =>
    res.cookie(name, value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: seconds * 1000,
    });
  const router = Router();
  router.get("/me", async (req, res) => {
    const session = await read(req, "flare_session");
    res.json({
      authenticated: !!session || dev || preview,
      user:
        session?.user ??
        (dev || preview
          ? {
              name: preview ? "Preview" : "Development",
              sub: preview ? "preview" : "dev",
              issuer: "local",
            }
          : null),
      configured: !!(issuer && clientId),
      development: dev,
      preview: preview && !session,
    });
  });
  router.get("/login", async (_req, res) => {
    const c = await config();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    set(res, "flare_flow", await seal({ verifier, state, nonce }, "flare_flow", 600), 600);
    res.redirect(
      oidc.buildAuthorizationUrl(c, {
        redirect_uri: new URL("/auth/callback", origin).href,
        scope: process.env.OIDC_SCOPE || "openid profile email",
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
        state,
        nonce,
      }).href,
    );
  });
  router.get("/callback", async (req, res) => {
    const flow = await read(req, "flare_flow");
    set(res, "flare_flow", "", 0);
    if (!flow) {
      res.status(400).send("Login expired. Please start again.");
      return;
    }
    const tokens = await oidc.authorizationCodeGrant(
      await config(),
      new URL(req.originalUrl, origin),
      {
        pkceCodeVerifier: String(flow.verifier),
        expectedState: String(flow.state),
        expectedNonce: String(flow.nonce),
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    if (!claims?.sub) throw new Error("The provider did not return an identity.");
    const allowed = process.env.OIDC_ALLOWED_SUBJECTS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowed?.length && !allowed.includes(claims.sub)) {
      res.status(403).send("This account is not allowed.");
      return;
    }
    const user: Identity = {
      sub: claims.sub,
      issuer: claims.iss,
      name:
        typeof claims.name === "string"
          ? claims.name
          : typeof claims.preferred_username === "string"
            ? claims.preferred_username
            : "Noren user",
    };
    set(res, "flare_session", await seal({ user }, "flare_session", 28800), 28800);
    res.redirect("/");
  });
  router.post("/logout", (_req, res) => {
    set(res, "flare_session", "", 0);
    res.json({ ok: true });
  });
  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    const session = await read(req, "flare_session");
    if (session?.user) {
      res.locals.identity = session.user;
      next();
    } else if (dev || preview) {
      res.locals.identity = {
        sub: preview ? "preview" : "dev",
        issuer: "local",
        name: "Development",
      };
      res.locals.preview = preview;
      next();
    } else res.status(401).json({ error: "Sign in to continue." });
  };
  const sameOrigin = (req: Request, res: Response, next: NextFunction) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin !== origin.origin) {
      res.status(403).json({ error: "Request origin not allowed." });
      return;
    }
    next();
  };
  return { router, requireAuth, sameOrigin, origin };
}
