import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { lookup as dnsLookup, type LookupOptions } from "node:dns";
import { request as httpsRequest } from "node:https";
export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function isPublicAddress(ip: string) {
  if (ip.includes(":")) return !/^(::|fc|fd|fe[89ab]|ff|2001:db8)/i.test(ip);
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
export async function publicOrigin(value: string) {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Enter an HTTPS server hostname without a path.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new Error("Use a public social server.");
  return url.origin;
}
export async function jsonRequest<T = any>(
  url: string | URL,
  init: RequestInit = {},
): Promise<{ data: T; response: Response }> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { accept: "application/json", ...init.headers },
  });
  if (!response.ok)
    throw new UpstreamError(
      response.status,
      response.status === 401
        ? "Session expired. Reconnect this account."
        : response.status === 429
          ? "Rate limit reached. Please try again later."
          : `The social server returned HTTP ${response.status}.`,
    );
  return { data: (await response.json()) as T, response };
}
// Validate the addresses at socket connection time, not only at account creation.
export const publicLookup: typeof dnsLookup = ((
  hostname: string,
  options: LookupOptions,
  callback: any,
) => {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }
    if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) {
      callback(new Error("Private network addresses are not allowed."));
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}) as typeof dnsLookup;
export const publicFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Use a public HTTPS endpoint.");
  if (
    isIP(url.hostname.replace(/^\[|\]$/g, "")) &&
    !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))
  )
    throw new Error("Private network addresses are not allowed.");
  const headers = Object.fromEntries(request.headers);
  headers["accept-encoding"] = "identity";
  const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
  return new Promise<Response>((resolve, reject) => {
    const outgoing = httpsRequest(
      url,
      {
        method: request.method,
        headers,
        lookup: publicLookup,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 8 * 1024 * 1024) {
            incoming.destroy(new Error("Response exceeded 8 MB."));
            return;
          }
          chunks.push(chunk);
        });
        incoming.on("error", reject);
        incoming.on("end", () => {
          const status = incoming.statusCode || 502;
          if (status >= 300 && status < 400) {
            reject(new Error("The server redirected this request. Use its final HTTPS address."));
            return;
          }
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(incoming.headers)) {
            if (value !== undefined)
              responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
          }
          resolve(
            new Response(
              [204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks)),
              { status, headers: responseHeaders },
            ),
          );
        });
      },
    );
    outgoing.on("error", reject);
    outgoing.end(body);
  });
};
export async function publicJson(url: string | URL, init: RequestInit = {}) {
  const response = await publicFetch(String(url), init);
  if (!response.ok)
    throw new UpstreamError(
      response.status,
      response.status === 401
        ? "Reconnect this account."
        : response.status === 429
          ? "Rate limit reached. Please try again later."
          : `The social server returned HTTP ${response.status}.`,
    );
  return {
    data: response.status === 204 ? null : await response.json(),
    response,
  };
}
