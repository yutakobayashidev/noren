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
