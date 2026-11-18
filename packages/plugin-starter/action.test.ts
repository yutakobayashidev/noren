import { test, expect } from "vite-plus/test";
import run from "./action.js";
test("quote retains line boundaries and the original link", () => {
  expect(run({ post: { text: "first\nsecond", url: "https://example.org/p" } })).toEqual({
    kind: "copyText",
    text: "> first\n> second\n\nhttps://example.org/p",
  });
});
