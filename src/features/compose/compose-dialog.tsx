import { signNostr } from "../../lib/nostr";
import { t } from "../../lib/i18n";
import { useEffect, useState } from "react";
import { Send, LoaderCircle, Globe, FileText } from "lucide-react";
import type { Account, SocialPost } from "../../domain/model";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Avatar, PlatformIcon } from "../../components/platform";
import { api, errorMessage } from "../../lib/api";
type PublishResult = { accountId: string; ok: boolean; error?: string };
export function ComposeDialog({
  open,
  onOpenChange,
  accounts,
  reply,
  onPublished,
  storageKey,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  accounts: Account[];
  reply?: SocialPost;
  onPublished: () => void;
  storageKey: string;
}) {
  const draftKey = `${storageKey}:draft:${reply?.key ?? "new"}`;
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setError("");
    try {
      setText(localStorage.getItem(draftKey) || "");
    } catch {
      setText("");
    }
    setSelected(
      reply
        ? [reply.accountId]
        : accounts
            .filter((a) => a.canPost)
            .slice(0, 1)
            .map((a) => a.id),
    );
  }, [open, reply?.key, draftKey]);
  function update(value: string) {
    setText(value);
    try {
      localStorage.setItem(draftKey, value);
    } catch {
      /* private browsing */
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const signedEvents = Object.fromEntries(
        await Promise.all(
          accounts
            .filter((a) => selected.includes(a.id) && a.platform === "nostr")
            .map(async (a) => [
              a.id,
              await signNostr(
                {
                  kind: 1,
                  created_at: Math.floor(Date.now() / 1000),
                  content: text.trim(),
                  tags: reply
                    ? [
                        ["e", reply.nativeId, "", "reply"],
                        ["p", reply.author.handle],
                      ]
                    : [],
                },
                a.handle,
              ),
            ]),
        ),
      );
      const { results } = await api<{ results: PublishResult[] }>(
        "/api/publish",
        { accountIds: selected, text, reply, signedEvents },
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        setSelected(failed.map((r) => r.accountId));
        setError(
          results.some((r) => r.ok)
            ? `Published to ${results.filter((r) => r.ok).length} account(s). Only failed accounts remain selected. ${failed.map((r) => r.error).join(" ")}`
            : failed.map((r) => r.error).join(" "),
        );
      } else {
        update("");
        onOpenChange(false);
        onPublished();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const count = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
  ].length;
  const limit = Math.min(
    ...accounts
      .filter((a) => selected.includes(a.id))
      .map((a) =>
        a.platform === "bluesky" ? 300 : a.platform === "twitter" ? 280 : 500,
      ),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">
          {reply ? t("Reply") : t("New post")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t(
            "Choose accounts and write your post. Drafts are saved in this browser.",
          )}
        </DialogDescription>
        <form onSubmit={submit}>
          <div className="mt-5 flex flex-wrap gap-2">
            {accounts
              .filter((a) => a.canPost && (!reply || a.id === reply.accountId))
              .map((account) => (
                <button
                  type="button"
                  key={account.id}
                  disabled={busy}
                  aria-pressed={selected.includes(account.id)}
                  onClick={() =>
                    setSelected((old) =>
                      old.includes(account.id)
                        ? old.filter((id) => id !== account.id)
                        : [...old, account.id],
                    )
                  }
                  className={`account-chip ${selected.includes(account.id) ? "selected" : ""}`}
                >
                  <Avatar
                    name={account.displayName}
                    url={account.avatarUrl}
                    size={24}
                  />
                  <PlatformIcon platform={account.platform} size={14} />
                  <span>{account.displayName}</span>
                </button>
              ))}
          </div>
          {reply && (
            <blockquote className="mt-4 rounded-2xl bg-muted p-3 text-sm">
              <strong>{reply.author.name}</strong>
              <p className="mt-1 line-clamp-3 text-muted-foreground">
                {reply.text}
              </p>
            </blockquote>
          )}
          <textarea
            autoFocus
            aria-label={t("Post text")}
            className="compose-input"
            value={text}
            disabled={busy}
            onChange={(e) => update(e.target.value)}
            placeholder={
              reply ? t("Write your reply…") : t("What’s on your mind?")
            }
            rows={6}
          />
          {error && (
            <p role="alert" className="error-message mb-4">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <Globe size={16} />
            <span>{t("Public")}</span>
            <span className="ml-auto flex items-center gap-1.5 text-xs">
              <FileText size={13} />
              {t("Draft saved locally")}
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span
              className={
                count > limit ? "text-destructive" : "text-muted-foreground"
              }
            >
              {count}
              {Number.isFinite(limit) ? ` / ${limit}` : ""}
            </span>
            <Button
              type="submit"
              disabled={
                busy || !text.trim() || !selected.length || count > limit
              }
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
              {reply ? t("Reply") : t("Post")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
