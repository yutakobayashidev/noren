# Noren 部署指南

[English](../en/guide.md) · [日本語](../ja/guide.md) · [简体中文](../zh-CN/guide.md) · [README](README.md)

Noren 的 React 客户端和 Node.js 服务端负责登录、时间线和发帖。Astro 静态站点包含产品介绍页和交互式插件开发指南。常规构建可在同一域名提供这两部分，也可以为介绍页单独配置域名。

## 登录并连接社交账号

在 Pocket ID 等支持 Discovery 的 OIDC 提供方注册一个 Web 客户端。将客户端的公开 HTTPS 地址设为 `APP_ORIGIN`，并将 `${APP_ORIGIN}/auth/callback` 注册为准确的回调 URI。设置 `OIDC_ISSUER`、`OIDC_CLIENT_ID` 及提供方要求的客户端密钥。[环境变量示例](../../.env.example)

登录后打开「账号」并选择网络。Mastodon 支持 OAuth 和访问令牌，Bluesky 支持 OAuth 和应用专用密码。使用 Bluesky OAuth 时，确保外部可以从客户端域名访问 `/bluesky-client.json`。Misskey 使用 MiAuth 授权。Nostr 需要安装支持 NIP-07 的浏览器扩展，并在扩展中批准签名请求。

## 使用 Docker Compose

将 `.env.example` 复制为 `.env`，填写 OIDC 配置并设置 `TWITTER_BROWSER_PASSWORD` 后启动服务。

```sh
docker compose up -d --build
```

打开 http://localhost:3101 进入 Noren。要连接 X，请访问 https://localhost:6901，用 `kasm_user` 和浏览器密码进入 Chrome。在该浏览器中登录 X，然后在 Noren 中选择 `account1`。如果服务在远程主机上，可运行 `ssh -L 6901:localhost:6901 <server>` 转发浏览器端口。

公开部署时，请在客户端前配置 HTTPS 反向代理。所有能登录该实例的用户都可以使用同一个 Relay 配置。个人实例可将 `OIDC_ALLOWED_SUBJECTS` 设为自己的 OIDC subject。备份时请同时保存 `flare-data` 和 `twitter-profile` 两个卷。

## 使用 NixOS

导入此 flake 的 `nixosModules.default`。将客户端密钥放入运行时读取的环境变量文件。备份整个 `/var/lib/flare-web` 目录，其中包含加密密钥。

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

介绍页可使用独立域名。将 `PUBLIC_FLARE_APP_URL` 设为 **Noren 客户端**的公开 HTTPS 地址。Astro 会在构建时将此地址写入客户端、插件目录和许可声明的链接。OIDC 和社交账号凭据保存在客户端的服务端。

在仓库根目录运行 `pnpm install --frozen-lockfile`。首次从本机发布前，运行 `pnpm dlx wrangler@4.164.0 login` 完成认证。将下方示例地址替换为自己的客户端地址。

```sh
PUBLIC_FLARE_APP_URL=https://social.example.org pnpm --filter @flare/site run deploy
```

要在发布前检查上传内容，请运行以下命令。

```sh
PUBLIC_FLARE_APP_URL=https://social.example.org pnpm --filter @flare/site build:worker
pnpm dlx wrangler@4.164.0 deploy --config apps/site/wrangler.jsonc --dry-run
```

若要通过 Git 自动部署，在 Cloudflare 的 **Workers Builds** 中将此仓库连接到 `noren-site` Worker。以仓库根目录作为根目录，设置构建变量 `PUBLIC_FLARE_APP_URL`，并选择生产分支。使用下列构建和部署命令。 [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

| 构建命令 | 部署命令 |
| --- | --- |
| `pnpm --filter @flare/site build:worker` | `pnpm dlx wrangler@4.164.0 deploy --config apps/site/wrangler.jsonc` |

日语介绍页位于 `/`，英语为 `/en/`，简体中文为 `/zh/`。在上述路径后追加 `plugins/` 即可打开对应的开发指南。客户端内嵌版本的路径均以 `/site` 开头。

## 编写插件

把[引用操作示例](../../plugins/quote-local/)复制到 `plugins/` 下的新目录，在 manifest 中设置唯一 ID、作者和各语言的名称。读取正文需要 `post.text` 权限，读取原帖链接需要 `post.url`。从 `action.js` 导出操作，返回 `inlineText` 可在帖子下显示文字，返回 `copyText` 可打开复制对话框。

启动客户端，在插件目录中启用你的操作。使用 NixOS 分发时，将插件目录添加到 `services.noren.plugins`。对于外部插件，管理员可以用 non-flake input 将版本固定在 `flake.lock` 中。
