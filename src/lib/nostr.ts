import type { Event, EventTemplate } from "nostr-tools/pure";
import { api } from "./api";
interface Extension {
  getPublicKey(): Promise<string>;
  signEvent(template: EventTemplate): Promise<Event>;
}
export async function signNostr(template: EventTemplate, expectedKey?: string) {
  const signer = (window as Window & { nostr?: Extension }).nostr;
  if (!signer) throw new Error("Install a NIP-07 extension to connect Nostr.");
  const key = await signer.getPublicKey();
  if (expectedKey && key !== expectedKey)
    throw new Error("Select the connected Nostr account in your extension.");
  const event = await signer.signEvent(template);
  if (event.pubkey !== key) throw new Error("The extension changed accounts.");
  return event;
}
export async function connectNostr() {
  const template = await api<EventTemplate>("/api/nostr/challenge", {});
  await api("/api/nostr/connect", await signNostr(template));
}
