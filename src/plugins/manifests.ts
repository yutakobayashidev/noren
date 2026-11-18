import { z } from "zod";
const identifier = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const label = z.string().trim().min(1).max(120);
export const manifestV2 = z
  .object({
    apiVersion: z.literal(2),
    id: identifier,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    action: identifier,
    author: label,
    name: z.object({ en: label, ja: label, zh: label }),
    permissions: z.array(z.enum(["post.text", "post.url"])),
    entry: z.literal("./action.js"),
  })
  .strict();
