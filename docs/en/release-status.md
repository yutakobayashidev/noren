# Release status · 19 November 2026

[English](release-status.md) · [日本語](../release-status.md) · [简体中文](../zh-CN/release-status.md)

The local preview is ready to try. The remaining production checks require the deployment origin and real accounts.

| Area | Verified | Still to check |
| --- | --- | --- |
| Sign-in | OIDC authorization-code flow against a local provider | Sign in and out through Pocket ID on the production HTTPS origin. |
| Networks | Connection paths implemented for all five networks. Browser tests use fixtures for feeds and publishing. | Connect each real account, read, publish and reconnect after a restart. Nostr reactions and lists are still unimplemented. |
| Timeline and composer | Chromium tests cover saving, threads, posting to multiple destinations, retrying failures, notes, follow-ups and expiring tabs. | Exercise real service limits and long-running sessions. |
| Plugins | Nix installation, enabling a post action and isolated execution. The WebMCP search form is implemented. | Run a search with an agent in a WebMCP-capable browser. |
| PLaMo | An AMD GPU translated two posts in a production build in 3.33 s and 0.20 s after importing a verified model. Inference made no external requests. | Measure on Android hardware and verify interrupted downloads against the upstream CDN. |
| PWA and languages | Manifest, service worker, client, site and author guide in English, Japanese and Simplified Chinese. | Open the installed app from a mobile home screen. Some server errors still appear in English. |
| Distribution | NixOS module, Compose stack, license notices and a corresponding-source archive in production builds. | Deploy on dotnix and exercise the live accounts. |
