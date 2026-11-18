# Operating Noren

[English](../en/guide.md) · [日本語](../ja/guide.md) · [简体中文](../zh-CN/guide.md) · [README](../../README.md)

Noren runs as two deployable pieces. The React client and Node.js server handle sign-in, timelines and posting. The Astro site contains the landing page and interactive plugin guide. A client build serves both at one origin. A static deployment can give the site its own domain.

## Sign in and connect a network

Register Noren as a web client with a Discovery-compatible OIDC provider such as Pocket ID. Use the public HTTPS client origin for `APP_ORIGIN`. Register `${APP_ORIGIN}/auth/callback` as the exact redirect URI. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and the provider’s client secret if required. See the [environment example](../../.env.example).

After signing in, open **Accounts** and select a network. Mastodon supports OAuth and access tokens. Bluesky supports OAuth and app passwords. For Bluesky OAuth, expose `/bluesky-client.json` on the public client origin. Misskey redirects to MiAuth. For Nostr, install a NIP-07 signer and approve the request in the extension.

## Run the Compose stack

Copy `.env.example` to `.env`, fill in the OIDC settings and set `TWITTER_BROWSER_PASSWORD` before starting the stack.

```sh
docker compose up -d --build
```

Open http://localhost:3101 for Noren. To connect X, visit https://localhost:6901 and sign in as `kasm_user` with the browser password. Sign in to X inside that Chrome session, then select `account1` in Noren. For a remote host, forward the browser port with `ssh -L 6901:localhost:6901 <server>`.

Put an HTTPS reverse proxy in front of the client for public access. Everyone allowed into this instance can use its relay profile. For a personal instance, set `OIDC_ALLOWED_SUBJECTS` to your own OIDC subject. Back up both named volumes, `flare-data` and `twitter-profile`.

## Run on NixOS

Import the flake’s `nixosModules.default`. Put the client secret in the runtime environment file. Back up `/var/lib/flare-web`, including its encryption key.

```nix
services.noren = {
  enable = true;
  port = 3101;
  settings = {
    APP_ORIGIN = "https://social.example.org";
    OIDC_ISSUER = "https://id.example.org";
    OIDC_CLIENT_ID = "noren";
  };
  environmentFile = "/run/secrets/noren.env";
};
```

## Cloudflare Workers

Publish the landing page at its own origin. Set `PUBLIC_FLARE_APP_URL` to the existing HTTPS **client** address. Astro writes this address into the app, registry and license links at build time. OIDC and social credentials belong on the client server.

From the repository root, install dependencies with `pnpm install --frozen-lockfile`. For a first local deploy, authenticate once with `pnpm dlx wrangler@4.164.0 login`. Replace the example client address before running the following command.

```sh
PUBLIC_FLARE_APP_URL=https://social.example.org pnpm --filter @flare/site run deploy
```

To check the upload without publishing, run:

```sh
PUBLIC_FLARE_APP_URL=https://social.example.org pnpm --filter @flare/site build:worker
pnpm dlx wrangler@4.164.0 deploy --config apps/site/wrangler.jsonc --dry-run
```

For Git deployments, connect this repository to the `noren-site` Worker in **Workers Builds**. Use the repository root as the root directory, set `PUBLIC_FLARE_APP_URL` as a build variable, and use the commands below. Select the production branch you want Cloudflare to deploy. [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

| Build command | Deploy command |
| --- | --- |
| `pnpm --filter @flare/site build:worker` | `pnpm dlx wrangler@4.164.0 deploy --config apps/site/wrangler.jsonc` |

The Japanese landing page is at `/`. English and Chinese are at `/en/` and `/zh/`. Append `plugins/` to any of these paths for the author guide. In the bundled client build, prefix the same paths with `/site`.

## Build a plugin

Copy [the quote example](../../plugins/quote-local/) into a new directory under `plugins/`. Give the manifest a unique ID, localized labels and an author. Request `post.text` for the selected post’s text or `post.url` for its original link. Export an action from `action.js` and return `inlineText` to display text below the post or `copyText` to offer a copy dialog.

Start the client and enable the action in the plugin registry. For NixOS distribution, add the directory to `services.noren.plugins`. A non-flake input lets an operator pin an external plugin in `flake.lock`.
