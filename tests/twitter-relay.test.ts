import { expect, test, vi } from "vite-plus/test";
import { twitterClient, twitterFeed } from "../server/adapters/twitter";

test("connects the selected relay profile using its recorded Viewer request", async () => {
  const origin = "https://relay.example";
  const profile = "second-profile";
  const entry = {
    method: "GET",
    path: "/graphql/current-operation-id/Viewer",
    params: { variables: "{}", features: '{"newFeature":true}' },
    headers: { authorization: "recorded header must not be replayed" },
  };
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(entry)))
    .mockResolvedValueOnce(
      Response.json({
        data: {
          viewer: {
            user_results: {
              result: {
                rest_id: "42",
                avatar: { image_url: "https://pbs.twimg.com/profile_images/example.jpg" },
                core: { screen_name: "example", name: "Example" },
              },
            },
          },
        },
      }),
    );
  vi.stubEnv("TWITTER_RELAY_BASE_URL", origin);
  vi.stubGlobal("fetch", request);
  try {
    const client = twitterClient({
      id: "twitter:" + profile,
      platform: "twitter",
      origin,
      profile,
      displayName: profile,
      handle: profile,
      canPost: true,
    });
    expect(await client.getCurrentUser()).toEqual({
      success: true,
      avatarUrl: "https://pbs.twimg.com/profile_images/example.jpg",
      user: { id: "42", username: "example", name: "Example" },
    });
    const [[catalog], [viewer, options]] = request.mock.calls;
    expect(String(catalog)).toBe(origin + "/requests.ndjson");
    const url = new URL(String(viewer));
    expect(url.origin + url.pathname).toBe(origin + "/i/api" + entry.path);
    expect(Object.fromEntries(url.searchParams)).toEqual(entry.params);
    expect(options?.headers).toEqual({ "x-profile-name": profile });
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

test("the recommended feed reads X's ranked home timeline without promoted posts", async () => {
  const account = {
    id: "twitter:ranked-profile",
    platform: "twitter" as const,
    origin: "https://relay.example",
    profile: "ranked-profile",
    displayName: "ranked",
    handle: "ranked",
    canPost: true,
  };
  const tweet = (id: string, createdAt: string, promoted = false) => ({
    entryId: (promoted ? "promoted-tweet-" : "tweet-") + id,
    content: {
      itemContent: {
        ...(promoted ? { promotedMetadata: { advertiser_results: {} } } : {}),
        tweet_results: {
          result: {
            __typename: "Tweet",
            rest_id: id,
            core: {
              user_results: {
                result: { rest_id: "7", core: { screen_name: "author", name: "Author" } },
              },
            },
            legacy: { full_text: "post " + id, created_at: createdAt, conversation_id_str: id },
          },
        },
      },
    },
  });
  vi.stubEnv("TWITTER_RELAY_BASE_URL", account.origin);
  const client = twitterClient(account) as any;
  vi.spyOn(client, "getQueryId").mockResolvedValue("current-query-id");
  const request = vi.spyOn(client, "fetchWithTimeout").mockResolvedValue(
    Response.json({
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                entries: [
                  tweet("1", "Mon Jan 01 00:00:00 +0000 2024"),
                  tweet("2", "Fri Jan 05 00:00:00 +0000 2024", true),
                  tweet("3", "Wed Jan 03 00:00:00 +0000 2024"),
                  { entryId: "cursor-bottom", content: { cursorType: "Bottom", value: "next" } },
                ],
              },
            ],
          },
        },
      },
    }),
  );
  try {
    const page = await twitterFeed(account, { kind: "recommended" });
    expect(String(request.mock.calls[0][0])).toContain("/current-query-id/HomeTimeline?");
    expect(page.posts.map((post) => post.nativeId)).toEqual(["1", "3"]);
    expect(page.nextCursor).toBe("next");
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});
