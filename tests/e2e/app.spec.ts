import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const account = {
  id: "a",
  platform: "mastodon",
  displayName: "Alex",
  handle: "alex@example.org",
  origin: "https://example.org",
  canPost: true,
};
const second = {
  ...account,
  id: "b",
  platform: "bluesky",
  displayName: "Bluesky Alex",
};
const post = {
  key: "mastodon:1",
  accountId: "a",
  platform: "mastodon",
  nativeId: "1",
  url: "https://example.org/p/1",
  text: "A quiet place for your social world.",
  author: { name: "Flare community", handle: "flare@example.org" },
  createdAt: new Date().toISOString(),
  likes: 3,
  reposts: 1,
  replies: 2,
};
async function fixture(page: Page) {
  await page.route("**/api/accounts", (route) =>
    route.fulfill({ json: { accounts: [account, second], guest: null } }),
  );
  await page.route("**/api/timeline", (route) =>
    route.fulfill({
      json: {
        posts: route.request().postDataJSON().accountId === "a" ? [post] : [],
      },
    }),
  );
  await page.route("**/api/thread", (route) =>
    route.fulfill({
      json: {
        posts: [post, { ...post, key: "reply", nativeId: "2", text: "A thoughtful reply." }],
      },
    }),
  );
  await page.route("**/api/action", (route) =>
    route.fulfill({ json: { post: { ...post, liked: true, likes: 4 } } }),
  );
  await page.goto("/");
  await expect(page.getByText(post.text)).toBeVisible();
}
test("native-style feed supports reactions, saved posts, thread, theme and accessible dialogs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fixture(page);
  await page.getByRole("button", { name: "Like", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unlike", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Save post", exact: true }).click();
  await page.getByRole("button", { name: "Saved", exact: true }).first().click();
  await expect(page.getByText(post.text)).toBeVisible();
  await page.getByRole("button", { name: "Open conversation" }).click();
  await expect(page.getByText("A thoughtful reply.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.keyboard.press("Escape");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
test("cross-post partial failure retains the draft and only retries failed accounts", async ({
  page,
}) => {
  await fixture(page);
  let requests: string[][] = [];
  await page.route("**/api/publish", (route) => {
    const input = route.request().postDataJSON();
    requests.push(input.accountIds);
    return route.fulfill({
      json: {
        results:
          requests.length === 1
            ? [
                { accountId: "a", ok: true },
                { accountId: "b", ok: false, error: "Try again" },
              ]
            : [{ accountId: "b", ok: true }],
      },
    });
  });
  await page.getByRole("button", { name: "New post", exact: true }).click();
  await page.getByRole("button", { name: "Bluesky Alex", exact: true }).click();
  await page.getByLabel("Post text").fill("A cross-post draft");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Only failed accounts remain selected");
  await expect(page.getByLabel("Post text")).toHaveValue("A cross-post draft");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(requests).toEqual([["a", "b"], ["b"]]);
});
test("mobile layout has no horizontal overflow and dialogs restore focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Compose post", exact: true }).click();
  await expect(page.getByLabel("Post text")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Compose post", exact: true })).toBeFocused();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Discover" })
    .click();
  await page.getByRole("textbox", { name: "Search posts" }).fill("日本語");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  await page.goBack();
  await expect(page.getByRole("textbox", { name: "Search posts" })).toHaveValue("");
});
test("an enabled isolated quote action receives the selected post", async ({ page }) => {
  await fixture(page);
  await page.goto("/#page=plugins");
  await page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Quote text" }) })
    .getByRole("button", { name: "Enable plugin" })
    .click();
  await page.goto("/");
  await page.getByRole("button", { name: "Quote text" }).click();
  await expect(page.getByRole("textbox", { name: "Plugin output" })).toHaveValue("> " + post.text);
});

test("sandboxed actions have no DOM, origin storage or network access", async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const modulePath = "/src/plugins/sandbox.ts";
    const { runIsolated } = await import(modulePath);
    return runIsolated(
      `exports.default = async () => {
      let network = false, storage = false;
      try { await fetch("https://example.org/"); network = true; } catch {}
      try { await caches.open("test"); storage = true; } catch {}
      return {kind:"inlineText",text:JSON.stringify([typeof document, network, storage])};
    };`,
      {},
      new AbortController().signal,
    );
  });
  expect(JSON.parse(result.text)).toEqual(["undefined", false, false]);
});

test("PLaMo checks device support before any model download", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
  const downloads: string[] = [];
  await page.route("https://huggingface.co/**", (route) => {
    downloads.push(route.request().url());
    return route.abort();
  });
  await fixture(page);
  await page.goto("/#page=plugins");
  const plugin = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "Translate with PLaMo" }) });
  await plugin.getByRole("button", { name: "Enable plugin" }).click();
  await page.goto("/");
  await page.getByRole("button", { name: "Translate with PLaMo" }).click();
  await expect(page.getByRole("alert")).toContainText("shader-f16");
  expect(downloads).toEqual([]);
});

async function enablePlugins(page: Page, titles: string[]) {
  await page.goto("/#page=plugins");
  for (const name of titles) {
    const card = page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    await card.getByRole("button", { name: "Enable plugin" }).click();
  }
  await page.goto("/");
}
test("per-destination drafts and content warnings reach the publish API", async ({ page }) => {
  await fixture(page);
  await enablePlugins(page, ["Cross-post preview"]);
  await page.getByRole("button", { name: "New post", exact: true }).click();
  await page.getByRole("button", { name: "Bluesky Alex", exact: true }).click();
  await page.getByLabel("Post text").fill("Shared original");
  await page.locator("summary").filter({ hasText: "Alex · mastodon" }).click();
  await page.getByLabel("Destination text").first().fill("Long Mastodon version");
  await page.getByLabel("Content warning").fill("Spoilers");
  let data;
  await page.route("**/api/publish", (route) => {
    data = route.request().postDataJSON();
    return route.fulfill({
      json: {
        results: [
          { accountId: "a", ok: true },
          { accountId: "b", ok: true },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(data).toMatchObject({
    text: "Shared original",
    variants: { a: { text: "Long Mastodon version", warning: "Spoilers" }, b: {} },
  });
});
test("private notes persist and followed threads show only the author's descendants", async ({
  page,
}) => {
  await fixture(page);
  await enablePlugins(page, ["Private notes", "Followed updates"]);
  await page.getByRole("button", { name: "Save post", exact: true }).click();
  await page.getByRole("textbox", { name: "Private note", exact: true }).fill("conference");
  await page.getByRole("button", { name: "Follow updates", exact: true }).click();
  await page.route("**/api/thread", (route) =>
    route.fulfill({
      json: {
        posts: [
          post,
          { ...post, key: "2", nativeId: "2", replyToId: "1", text: "An author update" },
          { ...post, key: "3", nativeId: "3", replyToId: "9", text: "Another conversation" },
        ],
      },
    }),
  );
  await page.getByRole("button", { name: "Saved", exact: true }).first().click();
  await page.reload();
  await expect(page.getByText("An author update")).toBeVisible();
  await expect(page.getByText("Another conversation")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Private note", exact: true })).toHaveValue(
    "conference",
  );
  await page.getByLabel("Search private notes").fill("unrelated");
  await expect(page.getByRole("textbox", { name: "Private note", exact: true })).toHaveCount(0);
});
test("profile links navigate using a connected account", async ({ page }) => {
  await fixture(page);
  await enablePlugins(page, ["Linked profiles"]);
  await page.route("**/api/profile-links", (route) =>
    route.fulfill({ json: { links: ["https://bsky.app/profile/author.example.org"] } }),
  );
  await page.getByRole("button", { name: "Flare community", exact: true }).click();
  await page.getByRole("button", { name: "author.example.org · Bluesky Alex" }).click();
  await expect(page).toHaveURL(/account=b/);
  await expect(page).toHaveURL(/profile=author.example.org/);
});
test("timeline groups preserve each post and repost filtering survives a reload", async ({
  page,
}) => {
  await fixture(page);
  await enablePlugins(page, ["Group shared links", "Filter reposts"]);
  await page.route("**/api/timeline", (route) => {
    const accountId = route.request().postDataJSON().accountId;
    return route.fulfill({
      json: {
        posts: [
          {
            ...post,
            accountId,
            text: "See https://example.org/story",
            ...(accountId === "b" ? { boostedBy: { name: "River", handle: "river" } } : {}),
          },
        ],
      },
    });
  });
  await page.reload();
  await page.getByText("Shared link · 2", { exact: false }).click();
  await expect(
    page
      .getByText("See", { exact: false })
      .filter({ has: page.locator("a[href='https://example.org/story']") })
      .first(),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Filter reposts" }).selectOption("repost");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Filter reposts" })).toHaveValue("repost");
  await expect(page.getByText("River reposted")).toBeVisible();
  await expect(page.locator(".post-card")).toHaveCount(1);
});
test("event timeline combines account-specific sources and expires without removing saved posts", async ({
  page,
}) => {
  await page.clock.install();
  await fixture(page);
  await enablePlugins(page, ["Event timelines"]);
  await page.getByRole("button", { name: "Save post", exact: true }).click();
  await page.getByRole("button", { name: "Add timeline", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Conference");
  const end = await page.evaluate(() => {
    const d = new Date(Date.now() + 3600000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  await dialog.getByLabel("Ends at").fill(end);
  await dialog.getByRole("combobox", { name: "Timeline", exact: true }).selectOption("search");
  await dialog.getByLabel("Search query").fill("event tag");
  await dialog.getByRole("button", { name: "Include this source" }).click();
  await dialog.getByRole("combobox", { name: "Account", exact: true }).selectOption("b");
  await dialog.getByRole("combobox", { name: "Timeline", exact: true }).selectOption("user");
  await dialog.getByLabel("Handle").fill("event.example.org");
  const seen: { accountId: string; source: unknown }[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/timeline")) seen.push(request.postDataJSON());
  });
  await dialog.getByRole("button", { name: "Add timeline" }).click();
  await expect.poll(() => new Set(seen.map((request) => JSON.stringify(request))).size).toBe(2);
  expect(seen).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ accountId: "a", source: { kind: "search", query: "event tag" } }),
      expect.objectContaining({
        accountId: "b",
        source: { kind: "user", target: "event.example.org" },
      }),
    ]),
  );
  await page.clock.fastForward(3600001);
  await expect(page.getByRole("tab", { name: "Conference" })).toHaveCount(0);
  await page.getByRole("button", { name: "Saved", exact: true }).first().click();
  await expect(page.getByText(post.text)).toBeVisible();
});

test("touch swipes follow the timeline tabs and leave vertical scrolling to the feed", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page);
  await page.route("**/api/timeline", (route) =>
    route.fulfill({
      json: {
        posts: Array.from({ length: 20 }, (_, i) => ({
          ...post,
          key: String(i),
          nativeId: String(i),
          text: "Timeline " + route.request().postDataJSON().accountId + " post " + i,
        })),
      },
    }),
  );
  await page.getByRole("tab", { name: "Mastodon" }).click();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  async function swipe(dx: number, dy: number) {
    const x = dx < 0 ? 300 : 85;
    const y = 450;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  const active = page.getByRole("tab", { selected: true });
  await expect(page.locator("article").first()).toContainText("Timeline a");
  await expect(page.locator(".feed-scroll")).toHaveCSS("overscroll-behavior-y", "auto");
  await swipe(40, -200);
  await expect
    .poll(() => page.locator(".feed-scroll").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await expect(active).toHaveAccessibleName("Mastodon");
  await swipe(-190, 10);
  await expect(active).toHaveAccessibleName("Bluesky");
  await expect(page.locator("article").first()).toContainText("Timeline b");
  await swipe(-190, 10);
  await expect(active).toHaveAccessibleName("Bluesky");
  await swipe(190, 10);
  await expect(active).toHaveAccessibleName("Mastodon");
  await expect(page.locator("article").first()).toContainText("Timeline a");
});

test("installed app pull-to-refresh loads newer posts above the reading position", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
  await fixture(page);
  const note = (key: string, text: string, minute: number) => ({
    ...post,
    key,
    nativeId: key,
    text,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString(),
  });
  const shown = Array.from({ length: 20 }, (_, i) => note(String(i), "Garden note " + i, -i));
  // The newest page does not reach the shown posts, so a gap is left between them.
  const pages: Record<string, { posts: unknown[]; nextCursor?: string }> = {
    head: {
      posts: [note("new-3", "First bloom", 3), note("new-2", "Second bloom", 2)],
      nextCursor: "gap",
    },
    gap: { posts: [note("new-1", "Third bloom", 1), shown[0]], nextCursor: "after-gap" },
    older: { posts: [note("20", "Garden note 20", -20)] },
  };
  let pulling = false;
  let failGap = true;
  let openHead!: () => void;
  const head = new Promise<void>((resolve) => (openHead = () => resolve()));
  let openGap!: () => void;
  const gapPage = new Promise<void>((resolve) => (openGap = () => resolve()));
  const requests: string[] = [];
  await page.route("**/api/timeline", async (route) => {
    const { accountId, cursor } = route.request().postDataJSON();
    if (!pulling) return route.fulfill({ json: { posts: shown, nextCursor: "older" } });
    requests.push(accountId + ":" + (cursor ?? "head"));
    if (!cursor) await head;
    if (cursor === "gap" && failGap) {
      failGap = false;
      return route.fulfill({ status: 502, json: { error: "Mastodon is unavailable." } });
    }
    if (cursor === "gap") await gapPage;
    return route.fulfill({ json: pages[cursor ?? "head"] });
  });
  await page.getByRole("tab", { name: "Mastodon" }).click();
  const feed = page.locator(".feed-scroll");
  const anchor = page.getByText("Garden note 0", { exact: true });
  await expect(anchor).toBeInViewport();
  await expect(feed).toHaveCSS("overscroll-behavior-y", "contain");
  const bounds = (await anchor.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const status = page.getByRole("status");
  const newPosts = page.getByRole("button", { name: /new post/ });
  const gap = page.locator(".timeline-gap").getByRole("button");
  async function drag(distance: number, whileHeld: () => Promise<void>) {
    const x = bounds.x + 4;
    const y = bounds.y + 4;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y + (distance * i) / 8 }],
      });
    }
    await whileHeld();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  pulling = true;
  await expect(newPosts).toBeHidden();
  // As in Material 3, the indicator moves half as far as the finger and arms at 80 px.
  await drag(120, () => expect(status).toHaveText("Pull to refresh"));
  await expect(status).toBeEmpty();
  expect(requests).toEqual([]);
  await drag(200, () => expect(status).toHaveText("Release to refresh"));
  await expect(status).toHaveText("Loading posts…");
  openHead();
  await expect(page.locator("article").first()).toContainText("First bloom");
  await expect(status).toBeEmpty();
  expect(requests).toEqual(["a:head"]);
  expect(Math.abs((await anchor.boundingBox())!.y - bounds.y)).toBeLessThan(1);
  await expect(newPosts).toHaveText("2 new posts");
  await expect(newPosts).toBeInViewport();
  // Scrolling up into the lower new post leaves one unread above it.
  await feed.evaluate((el) => {
    const card = [...el.querySelectorAll<HTMLElement>("article")].find((article) =>
      article.textContent?.includes("Second bloom"),
    )!;
    const offset = card.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTop += offset + card.offsetHeight / 2;
  });
  await expect(newPosts).toHaveText("1 new post");
  await newPosts.click();
  await expect(newPosts).toBeHidden();
  await expect(page.getByText("First bloom", { exact: true })).toBeInViewport();
  expect(await feed.evaluate((el) => el.scrollTop)).toBe(0);
  // Loading the gap keeps the post below it in place, as Flare does.
  await expect(gap).toHaveText("Load missing posts");
  const below = (await anchor.boundingBox())!.y;
  await gap.click();
  await expect(gap).toHaveText("Could not load posts. Tap to retry.");
  await gap.click();
  await expect(gap).toHaveText("Loading missing posts…");
  await expect(gap).toBeDisabled();
  openGap();
  await expect(page.getByText("Third bloom", { exact: true })).toBeAttached();
  await expect(gap).toHaveCount(0);
  expect(Math.abs((await anchor.boundingBox())!.y - below)).toBeLessThan(1);
  await expect(page.locator("article")).toHaveCount(23);
  await expect(newPosts).toBeHidden();
  expect(requests).toEqual(["a:head", "a:gap", "a:gap"]);
  // Away from the top, the same gesture scrolls the feed instead of refreshing it.
  await feed.evaluate((el) => el.scrollTo(0, 300));
  await drag(200, () => expect(status).toBeEmpty());
  expect(requests).toEqual(["a:head", "a:gap", "a:gap"]);
  await feed.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.getByText("Garden note 20", { exact: true })).toBeAttached();
  expect(requests).toEqual(["a:head", "a:gap", "a:gap", "a:older"]);
});
