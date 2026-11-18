import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import ts from "typescript";
import { join } from "node:path";
import { manifestV2 } from "./src/plugins/manifests";

function validatePlugins() {
  const ids = new Set<string>();
  for (const root of ["packages", "plugins"]) {
    for (const folder of readdirSync(root)) {
      const dir = join(root, folder);
      if (!lstatSync(dir).isDirectory()) throw new Error("Invalid plugin directory: " + dir);
      const files = readdirSync(dir);
      if (root === "packages" && !files.includes("manifest.json")) continue;
      for (const name of ["action.js", "manifest.json"]) {
        if (!lstatSync(join(dir, name)).isFile())
          throw new Error("Expected regular file: " + dir + "/" + name);
      }
      const raw = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      const { id } = root === "plugins" ? manifestV2.parse(raw) : raw;
      if (ids.has(id)) throw new Error("Duplicate plugin id: " + id);
      ids.add(id);
    }
  }
}
export default defineConfig({
  plugins: [
    {
      name: "flare-worker-source",
      enforce: "pre",
      load(id) {
        if (!id.endsWith("/action.js?flare-worker")) return;
        const source = readFileSync(id.split("?")[0], "utf8");
        const output = ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        });
        return "export default " + JSON.stringify(output.outputText);
      },
    },
    { name: "flare-plugin-catalog", buildStart: validatePlugins },
    react(),
    tailwindcss(),
  ],
});
