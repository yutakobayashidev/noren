import { blueskyMetadata } from "./bluesky-oauth";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import express from "express";
import { createServer } from "node:http";
import { ZodError } from "zod";
import { createAuth } from "./auth";
import { apiRouter } from "./api";
import { UpstreamError } from "./http";

if (existsSync(".env")) loadEnvFile(".env");
const app = express();
const server = createServer(app);
const auth = createAuth();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api") || req.path.startsWith("/auth"))
    res.setHeader("Cache-Control", "no-store");
  next();
});
app.get("/bluesky-client.json", (_req, res) => res.json(blueskyMetadata()));
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use(express.json({ limit: "64kb" }));
app.use(auth.sameOrigin);
app.use("/auth", auth.router);
app.use("/api", auth.requireAuth, apiRouter());
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
app.get(["/source.tar.gz", "/licenses/bundled.md"], (req, res) => {
  const file = resolve("dist", req.path.slice(1));
  if (existsSync(file)) res.sendFile(file);
  else res.status(404).send("Available after the production build.");
});
app.use("/site", express.static(resolve("dist/site")));
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist"), { index: false }));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: [auth.origin.hostname],
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Check the entered values." });
      return;
    }
    const message = error instanceof Error ? error.message : "Something went wrong.";
    // Never include upstream bodies, headers or credentials in logs/responses.
    res.status(error instanceof UpstreamError ? 502 : 400).json({ error: message.slice(0, 300) });
  },
);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => console.log(`Noren listening at ${auth.origin.origin}`));
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
