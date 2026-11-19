import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReaction, mergePosts, type SocialPost } from "../src/domain/model";
import { AccountStore } from "../server/store";
import { mapMastodon, nextCursor } from "../server/adapters/mastodon";
import { identityKey } from "../server/auth";
import { isPublicAddress } from "../server/http";
const post = (accountId: string, likes = 0): SocialPost => ({
  accountId,
  key: "mastodon:https://example.org/post/1",
  nativeId: "1",
  platform: "mastodon",
  url: "https://example.org/post/1",
  text: "Hello",
  author: { name: "A", handle: "a@example.org" },
  createdAt: "2026-01-01T00:00:00Z",
  likes,
});
test("mixed feed preserves viewing accounts and merges repeated pages without losing actions", () => {
  const result = mergePosts([post("alice"), post("bob")], [post("alice", 4)]);
  assert.equal(result.length, 2);
  assert.equal(result.find((p) => p.accountId === "alice")?.likes, 4);
  assert.equal(result.find((p) => p.accountId === "bob")?.likes, 0);
});
test("reactions change the count only when the state changes", () => {
  const liked = applyReaction(post("alice", 3), "like", true, "at://like");
  assert.deepEqual([liked.liked, liked.likes, liked.likeUri], [true, 4, "at://like"]);
  assert.equal(applyReaction(liked, "like", true).likes, 4);
  const unliked = applyReaction(liked, "like", false);
  assert.deepEqual([unliked.liked, unliked.likes, unliked.likeUri], [false, 3, undefined]);
  assert.equal(applyReaction(post("alice"), "repost", false).reposts, undefined);
  assert.equal(applyReaction({ ...post("alice"), reposted: true }, "repost", false).reposts, 0);
});
test("account credentials survive restart encrypted and reject tampering", () => {
  const dir = mkdtempSync(join(tmpdir(), "flare-store-"));
  const store = new AccountStore(dir);
  store.put({
    id: "a",
    platform: "mastodon",
    origin: "https://example.org",
    displayName: "A",
    handle: "a",
    canPost: true,
    token: "test-private-token",
  });
  assert.equal(JSON.stringify(store.public()).includes("test-private-token"), false);
  assert.equal(
    readFileSync(join(dir, "accounts.enc")).includes(Buffer.from("test-private-token")),
    false,
  );
  assert.equal(new AccountStore(dir).get("a").token, "test-private-token");
  const bytes = readFileSync(join(dir, "accounts.enc"));
  bytes[30] ^= 1;
  writeFileSync(join(dir, "accounts.enc"), bytes);
  assert.throws(() => new AccountStore(dir));
});
test("identity partition includes issuer and subject", () => {
  assert.notEqual(
    identityKey({ sub: "same", issuer: "a", name: "A" }),
    identityKey({ sub: "same", issuer: "b", name: "A" }),
  );
  assert.equal(
    identityKey({ sub: "same", issuer: "a", name: "A" }),
    identityKey({ sub: "same", issuer: "a", name: "Renamed" }),
  );
});
test("remote content is sanitized, sensitive state is retained, media URLs are checked", () => {
  const account = {
    id: "a",
    platform: "mastodon" as const,
    origin: "https://example.org",
    displayName: "A",
    handle: "a",
    canPost: true,
  };
  const result = mapMastodon(
    {
      id: "1",
      uri: "https://example.org/p/1",
      url: "javascript:alert(1)",
      content:
        '<script>alert(1)</script><p>Hello <a href="javascript:alert(2)">bad</a><img src=x onerror=alert(3)><a href="https://example.org">safe</a></p>',
      account: {
        username: "a",
        acct: "a",
        display_name: "A",
        avatar: "javascript:alert(1)",
      },
      sensitive: true,
      spoiler_text: "CW",
      media_attachments: [{ type: "image", url: "javascript:alert(4)" }],
    },
    account,
  );
  assert.ok(!result.html?.includes("<script"));
  assert.ok(!result.html?.includes("javascript:"));
  assert.ok(!result.html?.includes("onerror"));
  assert.equal(result.url, account.origin + "/p/1");
  assert.equal(result.author.avatarUrl, undefined);
  assert.deepEqual(result.media, []);
  assert.equal(result.sensitive, true);
  assert.equal(result.contentWarning, "CW");
});
test("pagination never follows an arbitrary upstream URL", () => {
  assert.equal(
    nextCursor(
      '<https://evil.example/api/v1/timelines/home?max_id=3>; rel="next"',
      "https://example.org",
      "/api/v1/timelines/home",
    ),
    undefined,
  );
  assert.equal(
    nextCursor(
      '<https://example.org/api/v1/timelines/home?max_id=3>; rel="next"',
      "https://example.org",
      "/api/v1/timelines/home",
    ),
    "3",
  );
});
test("private social server addresses are rejected", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
});
