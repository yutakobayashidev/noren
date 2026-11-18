import { createContext } from "react";
import { language } from "../lib/i18n";
import { runIsolated, type ActionResult } from "./sandbox";
import { manifestV2 } from "./manifests";

type Input = { post: { text: string; url: string } };
type Run = (input: Input) => ActionResult;
type PostAction = {
  id: string;
  name: string;
  author: string;
  grant: string;
  run: (input: Input, signal: AbortSignal) => Promise<ActionResult>;
};
type Manifest = { id: string; name: string; author: string; apiVersion: number; entry: string };
const manifests = import.meta.glob<Manifest>("/packages/*/manifest.json", {
  import: "default",
  eager: true,
});
const modules = import.meta.glob<Run>("/packages/*/action.js", { import: "default" });
const external = import.meta.glob("/plugins/*/manifest.json", { import: "default", eager: true });
const sources = import.meta.glob<string>("/plugins/*/action.js", {
  query: "?flare-worker",
  import: "default",
});
export const postActions: PostAction[] = [
  ...Object.entries(manifests).map(([path, manifest]) => {
    const load = modules[path.replace(/manifest\.json$/, "action.js")];
    if (manifest.apiVersion !== 1 || manifest.entry !== "./action.js" || !load)
      throw new Error("Unsupported plugin: " + path);
    return { ...manifest, grant: manifest.id, run: async (input: Input) => (await load())(input) };
  }),
  ...Object.entries(external).map(([path, raw]) => {
    const m = manifestV2.parse(raw);
    const load = sources[path.replace(/manifest\.json$/, "action.js")];
    const grant = [m.id, ...new Set(m.permissions.toSorted())].join(":");
    return {
      id: m.id,
      grant,
      name: m.name[language],
      author: m.author,
      async run({ post }: Input, signal: AbortSignal) {
        const input = {
          post: Object.fromEntries(
            m.permissions.map((p) => {
              const key = p === "post.text" ? "text" : "url";
              return [key, post[key]];
            }),
          ),
          language,
        };
        return runIsolated(await load(), input, signal);
      },
    };
  }),
];
export const EnabledActions = createContext<string[]>([]);
