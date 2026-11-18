import { createContext } from "react";
type Manifest = { id: string; name: string; author: string; apiVersion: number; entry: string };
type Run = (input: { post: { text: string; url: string } }) => { kind: "copyText"; text: string };
const manifests = import.meta.glob<Manifest>("/packages/*/manifest.json", {
  import: "default",
  eager: true,
});
const modules = import.meta.glob<Run>("/packages/*/action.js", { import: "default" });
export const postActions = Object.entries(manifests).map(([path, manifest]) => {
  const load = modules[path.replace(/manifest\.json$/, "action.js")];
  if (manifest.apiVersion !== 1 || manifest.entry !== "./action.js" || !load)
    throw new Error("Unsupported plugin: " + path);
  return { ...manifest, load };
});
export const EnabledActions = createContext<string[]>([]);
