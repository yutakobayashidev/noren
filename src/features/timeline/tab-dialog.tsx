import { t } from "../../lib/i18n";
import { useState, useEffect } from "react";
import type { Account, Tab, FeedSource } from "../../domain/model";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { api, errorMessage } from "../../lib/api";
export function TabDialog({
  open,
  onOpenChange,
  accounts,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  accounts: Account[];
  onAdd: (tab: Tab) => void;
}) {
  const [kind, setKind] = useState<FeedSource["kind"]>("home");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [lists, setLists] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setAccountId(accounts[0]?.id || "");
      setError("");
    }
  }, [open]);
  useEffect(() => {
    if (kind !== "list" || !accountId) return;
    const abort = new AbortController();
    setLists([]);
    setError("");
    api<{ lists: { id: string; title: string }[] }>(
      `/api/lists?accountId=${encodeURIComponent(accountId)}`,
      undefined,
      undefined,
      abort.signal,
    )
      .then((d) => setLists(d.lists))
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      });
    return () => abort.abort();
  }, [kind, accountId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">
          {t("Add timeline")}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {t("Keep a search, profile or list close by.")}
        </DialogDescription>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            onAdd({
              id: crypto.randomUUID(),
              title: String(values.title),
              accountId,
              source: {
                kind,
                ...(kind === "search"
                  ? { query: String(values.target) }
                  : kind !== "home"
                    ? { target: String(values.target) }
                    : {}),
              },
            });
            onOpenChange(false);
          }}
        >
          <label>
            {t("Name")}
            <input
              name="title"
              required
              placeholder={t("My timeline")}
              maxLength={50}
            />
          </label>
          <label>
            {t("Account")}
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName} · {a.platform}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Timeline")}
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as FeedSource["kind"])}
            >
              <option value="home">{t("Home")}</option>
              <option value="search">{t("Search")}</option>
              <option value="user">{t("Profile")}</option>
              <option value="list">{t("List")}</option>
            </select>
          </label>
          {kind === "list" ? (
            <label>
              {t("List")}
              <select name="target" required>
                <option value="">{t("Select a list")}</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            kind !== "home" && (
              <label>
                {kind === "search" ? t("Search query") : t("Handle")}
                <input
                  name="target"
                  required
                  placeholder={
                    kind === "search"
                      ? t("What would you like to follow?")
                      : "username"
                  }
                />
              </label>
            )
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button disabled={!accountId}>{t("Add timeline")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
