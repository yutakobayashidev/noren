import { execFileSync } from "node:child_process";

const origin = URL.parse(process.env.PUBLIC_FLARE_APP_URL ?? "");
if (
  origin?.protocol !== "https:" ||
  origin.pathname !== "/" ||
  origin.username ||
  origin.password ||
  origin.hash ||
  origin.search
) {
  throw new Error("Set PUBLIC_FLARE_APP_URL to the HTTPS origin of your Noren client.");
}
execFileSync("pnpm", ["build"], {
  stdio: "inherit",
  env: { ...process.env, FLARE_EMBED_SITE: "" },
});
