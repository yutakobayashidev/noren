#!/bin/sh
set -eu
config=$(mktemp -d)
trap 'rm -f "$config/.npmrc"; rmdir "$config"' EXIT
printf '%s\n' '@yuta:registry=https://git.yutakobayashi.com/api/packages/yuta/npm/' > "$config/.npmrc"
# Archive build inputs only. Never traverse the repository root or a developer's home.
tar -czf dist/source.tar.gz --exclude=node_modules --exclude=dist --exclude=.git --exclude=.astro --exclude='.env*' \
  LICENSE README.md package.json pnpm-workspace.yaml pnpm-lock.yaml vite.config.ts tsconfig.json index.html \
  src server patches public plugins packages scripts/package-source.sh \
  apps/site/package.json apps/site/astro.config.mjs apps/site/src apps/site/public apps/site/ASSETS.md \
  Dockerfile .dockerignore flake.nix flake.lock nix compose.yaml docker playwright.config.ts vitest.config.ts tests docs -C "$config" .npmrc
