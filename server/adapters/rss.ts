import { XMLParser } from "fast-xml-parser";
import { publicFetch } from "../http";
import { webUrl } from "./mastodon";
import sanitizeHtml from "sanitize-html";
import { createHash } from "node:crypto";
import type { FeedPage, FeedSource, SocialPost } from "../../src/domain/model";
import type { StoredAccount } from "../store";
const list = (value: any): any[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const plain = (value: any) =>
  typeof value === "string" ? value : String(value?.["#text"] || "");
export function parseFeed(
  xml: string,
  account: StoredAccount,
): { title: string; page: FeedPage } {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Feeds with external entities are not supported.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    parseTagValue: false,
  }).parse(xml);
  const channel = parsed.rss?.channel || parsed.feed;
  if (!channel) throw new Error("This URL is not an RSS or Atom feed.");
  const title = plain(channel.title) || new URL(account.feedUrl!).host;
  const posts: SocialPost[] = list(channel.item || channel.entry)
    .slice(0, 100)
    .map((item: any) => {
      const link =
        typeof item.link === "string"
          ? item.link
          : list(item.link).find(
              (l: any) => !l["@_rel"] || l["@_rel"] === "alternate",
            )?.["@_href"];
      const url = webUrl(link) || account.feedUrl!;
      const html = sanitizeHtml(
        plain(
          item["content:encoded"] ||
            item.content ||
            item.description ||
            item.summary,
        ),
        {
          allowedTags: [
            "p",
            "br",
            "a",
            "strong",
            "em",
            "ul",
            "ol",
            "li",
            "blockquote",
          ],
          allowedAttributes: { a: ["href"] },
          allowedSchemes: ["https", "http"],
        },
      );
      const id = plain(item.guid || item.id) || url;
      const timestamp = Date.parse(
        plain(item.pubDate || item.published || item.updated),
      );
      const enclosure = list(item.enclosure).find(
        (e: any) =>
          String(e["@_type"]).startsWith("image/") && webUrl(e["@_url"]),
      );
      return {
        key: `rss:${createHash("sha256")
          .update(account.feedUrl! + id)
          .digest("hex")}`,
        nativeId: id,
        accountId: account.id,
        platform: "rss",
        url,
        text: [
          plain(item.title),
          sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }),
        ]
          .filter(Boolean)
          .join("\n\n"),
        author: {
          name: plain(item.author?.name || item["dc:creator"]) || title,
          handle: new URL(account.feedUrl!).host,
        },
        createdAt: Number.isFinite(timestamp)
          ? new Date(timestamp).toISOString()
          : undefined,
        media: enclosure ? [{ type: "photo", url: enclosure["@_url"] }] : [],
        readOnly: true,
      };
    });
  return { title, page: { posts } };
}
export async function rssFeed(
  a: StoredAccount,
  source: FeedSource = { kind: "home" },
) {
  const response = await publicFetch(a.feedUrl!);
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
  const result = parseFeed(await response.text(), a);
  if (source.kind === "search")
    result.page.posts = result.page.posts.filter((p) =>
      p.text
        .toLocaleLowerCase()
        .includes((source.query || "").toLocaleLowerCase()),
    );
  return result;
}
