import { t } from "../../lib/i18n";
import { useEffect, useState } from "react";
import { Bell, Heart, Repeat2, UserPlus, MessageCircle, LoaderCircle } from "lucide-react";
import type { Account, Notification, SocialPost } from "../../domain/model";
import { api, errorMessage } from "../../lib/api";
import { Avatar, PlatformIcon } from "../../components/platform";
export function Notifications({
  accounts,
  onThread,
  refresh,
}: {
  accounts: Account[];
  onThread: (post: SocialPost) => void;
  refresh: number;
}) {
  const [items, setItems] = useState<(Notification & { account: Account })[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setErrors([]);
    setItems([]);
    Promise.all(
      accounts.map(async (account) => {
        try {
          const result = await api<{
            notifications: Notification[];
            unsupported?: boolean;
          }>(
            `/api/notifications?accountId=${encodeURIComponent(account.id)}`,
            undefined,
            undefined,
            abort.signal,
          );
          return {
            items: result.notifications.map((n) => ({ ...n, account })),
            error: result.unsupported
              ? `${account.displayName}: X notifications are not available through the relay.`
              : null,
          };
        } catch (e) {
          return { items: [], error: errorMessage(e) };
        }
      }),
    ).then((results) => {
      if (abort.signal.aborted) return;
      setItems(
        results
          .flatMap((r) => r.items)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      );
      setErrors(results.flatMap((r) => (r.error ? [r.error] : [])));
      setLoading(false);
    });
    return () => abort.abort();
  }, [JSON.stringify(accounts.map((a) => a.id)), refresh]);
  const labels: Record<string, string> = {
    favourite: t("liked your post"),
    like: t("liked your post"),
    reblog: t("reposted your post"),
    repost: t("reposted your post"),
    follow: t("followed you"),
    mention: t("mentioned you"),
    reply: t("replied to you"),
    quote: t("quoted your post"),
  };
  return (
    <div className="notification-list">
      {errors.map((e, i) => (
        <p key={i} className="feed-error" role="alert">
          {e}
        </p>
      ))}
      {items.map((item) => {
        const Icon = ["like", "favourite"].includes(item.reason)
          ? Heart
          : ["repost", "reblog"].includes(item.reason)
            ? Repeat2
            : item.reason === "follow"
              ? UserPlus
              : MessageCircle;
        return (
          <article className="notification-card" key={`${item.account.id}:${item.id}`}>
            <Icon size={22} className="text-primary" />
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-2">
                <Avatar name={item.author.name} url={item.author.avatarUrl} size={32} />
                <PlatformIcon platform={item.account.platform} size={14} />
                <time className="ml-auto text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </time>
              </div>
              <p>
                <strong>{item.author.name}</strong> {labels[item.reason] || item.reason}
              </p>
              {item.post && (
                <button
                  className="mt-2 line-clamp-3 text-left text-sm text-muted-foreground"
                  onClick={() => onThread(item.post!)}
                >
                  {item.post.text}
                </button>
              )}
            </div>
          </article>
        );
      })}
      {loading ? (
        <div className="loading-state" role="status">
          <LoaderCircle className="animate-spin" />
          {t("Loading notifications…")}
        </div>
      ) : (
        !items.length && (
          <div className="empty-state">
            <Bell size={28} />
            <h2>{t("No notifications yet")}</h2>
            <p>
              {accounts.length
                ? t("New activity will appear here.")
                : t("Connect an account to see your notifications.")}
            </p>
          </div>
        )
      )}
    </div>
  );
}
