import { expect, test, vi } from "vite-plus/test";
import { twitterClient } from "../server/adapters/twitter";

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
