import { defineConfig } from "astro/config";
export default defineConfig({
  base: process.env.FLARE_EMBED_SITE ? "/site" : "/",
  outDir: process.env.FLARE_EMBED_SITE ? "../../dist/site" : "./dist",
  devToolbar: { enabled: false },
});
