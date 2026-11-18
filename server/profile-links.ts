import { mastodonRequest } from "./adapters/mastodon";
import { misskeyRequest } from "./adapters/misskey";
import { twitterClient } from "./adapters/twitter";
import { blueskyAgent } from "./adapters/bluesky";
import { nostrProfile } from "./adapters/nostr";
import type { StoredAccount, AccountStore } from "./store";
export async function profileLinks(account: StoredAccount, handle: string, store: AccountStore) {
  let fields: unknown[];
  if (account.platform === "twitter") {
    const result = await twitterClient(account).getUserProfile(handle);
    if (!result.success) throw new Error("Profile unavailable");
    fields = [
      result.profile.description,
      result.profile.url,
      ...Object.values(result.profile.entities ?? {}).flatMap(
        (entry) =>
          (entry as { urls?: { expanded_url?: string }[] })?.urls?.map((u) => u.expanded_url) ?? [],
      ),
    ];
  } else if (account.platform === "bluesky") {
    const { data } = await (await blueskyAgent(account, store)).getProfile({ actor: handle });
    fields = [data.description, data.website];
  } else if (account.platform === "nostr") {
    const profile = await nostrProfile(handle);
    fields = [profile.about, profile.website];
  } else {
    const [username, host] = handle.replace(/^@/, "").split("@");
    const { data } =
      account.platform === "misskey"
        ? await misskeyRequest(account, "users/show", {
            username,
            host: host === new URL(account.origin).host ? null : host,
          })
        : await mastodonRequest(
            account,
            "/api/v1/accounts/lookup?acct=" + encodeURIComponent(handle),
          );
    fields = [
      data.note,
      data.description,
      ...(data.fields ?? []).map((f: { value?: string }) => f.value),
    ];
  }
  return [
    ...new Set(
      fields.flatMap((v) =>
        typeof v === "string" ? (v.match(/https?:\/\/[^\s"<>（）)]+/gi) ?? []) : [],
      ),
    ),
  ].slice(0, 50);
}
