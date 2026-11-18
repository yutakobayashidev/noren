import { connectNostr } from "../../lib/nostr";
import { t } from "../../lib/i18n";
import { useState, useEffect } from "react";
import { Plus, LogOut, LoaderCircle, Check, ArrowLeft } from "lucide-react";
import type { Account, Platform } from "../../domain/model";
import { platformNames } from "../../domain/model";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Avatar, PlatformIcon } from "../../components/platform";
import { api, errorMessage } from "../../lib/api";

export function AccountsDialog({
  open,
  onOpenChange,
  accounts,
  onChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  accounts: Account[];
  onChange: () => void;
}) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [blueskyMethod, setBlueskyMethod] = useState("oauth");
  const [mastodonMethod, setMastodonMethod] = useState("oauth");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  useEffect(() => {
    if (open) {
      setBlueskyMethod("oauth");
      setMastodonMethod("oauth");
      setPlatform(null);
      setError("");
    }
  }, [open]);
  useEffect(() => {
    if (platform !== "twitter") return;
    let active = true;
    setLoadingProfiles(true);
    api<{ profiles: string[] }>("/api/twitter/profiles")
      .then((d) => {
        if (active) setProfiles(d.profiles);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoadingProfiles(false);
      });
    return () => {
      active = false;
    };
  }, [platform]);
  async function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (
        (platform === "bluesky" && blueskyMethod === "oauth") ||
        platform === "misskey" ||
        (platform === "mastodon" && mastodonMethod === "oauth")
      ) {
        const { url } = await api<{ url: string }>("/api/connect/" + platform, values);
        window.location.assign(url);
        return;
      }
      if (platform === "nostr") await connectNostr();
      else await api("/api/accounts", { platform, ...values });
      onChange();
      setPlatform(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(account: Account) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/accounts/${encodeURIComponent(account.id)}`, undefined, "DELETE");
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">
          {platform ? t("Add ") + platformNames[platform] : t("Your accounts")}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {platform
            ? t("Connect an account to start reading and posting.")
            : t("Your social world, together in Flare.")}
        </DialogDescription>
        {error && (
          <p role="alert" className="error-message mt-4">
            {error}
          </p>
        )}
        {!platform ? (
          <div className="mt-6 space-y-5">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-3">
                <Avatar name={account.displayName} url={account.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{account.displayName}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <PlatformIcon platform={account.platform} size={14} />
                    {account.handle}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Disconnect ${account.displayName}`}
                  disabled={busy}
                  onClick={() => disconnect(account)}
                >
                  <LogOut />
                </Button>
              </div>
            ))}
            <div className="grid gap-2">
              {(["mastodon", "bluesky", "twitter", "misskey", "nostr"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setError("");
                    setPlatform(p);
                  }}
                  className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-4 text-left hover:bg-accent"
                >
                  <PlatformIcon platform={p} size={24} />
                  <span className="flex-1 font-medium">{platformNames[p]}</span>
                  <Plus size={18} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={connect} className="mt-6 space-y-4">
            {platform === "misskey" && (
              <label>
                {t("Misskey server")}
                <input name="origin" placeholder="misskey.io" required />
              </label>
            )}
            {platform === "mastodon" && (
              <>
                <label>
                  {t("Server")}
                  <input name="origin" placeholder="mastodon.social" required autoComplete="url" />
                </label>
                <label>
                  {t("Sign-in method")}
                  <select
                    value={mastodonMethod}
                    onChange={(event) => setMastodonMethod(event.target.value)}
                  >
                    <option value="oauth">{t("Authorize on server (recommended)")}</option>
                    <option value="token">{t("Use an existing access token")}</option>
                  </select>
                </label>
                {mastodonMethod === "token" && (
                  <label>
                    {t("Access token")}
                    <input name="token" type="password" autoComplete="off" required />
                  </label>
                )}
              </>
            )}
            {platform === "bluesky" && (
              <>
                <label>
                  {t("Handle")}
                  <input
                    name="identifier"
                    placeholder="you.bsky.social"
                    required
                    autoComplete="username"
                  />
                </label>
                <label>
                  {t("Sign-in method")}
                  <select value={blueskyMethod} onChange={(e) => setBlueskyMethod(e.target.value)}>
                    <option value="oauth">{t("Authorize on server (recommended)")}</option>
                    <option value="password">{t("App password")}</option>
                  </select>
                </label>
                {blueskyMethod === "password" && (
                  <>
                    <label>
                      {t("App password")}
                      <input
                        name="password"
                        type="password"
                        required
                        autoComplete="off"
                        placeholder="xxxx-xxxx-xxxx-xxxx"
                      />
                    </label>
                    <details className="text-sm">
                      <summary>{t("Advanced")}</summary>
                      <label className="mt-3">
                        {t("Server")}
                        <input name="origin" defaultValue="https://bsky.social" required />
                      </label>
                    </details>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Use an app password from Bluesky Settings → Privacy and security → App passwords.",
                      )}
                    </p>
                  </>
                )}
              </>
            )}
            {platform === "twitter" && (
              <>
                {loadingProfiles ? (
                  <p className="text-sm text-muted-foreground">{t("Loading profiles…")}</p>
                ) : profiles.length ? (
                  <label>
                    {t("Relay profile")}
                    <select name="profile" required>
                      {profiles.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("No relay profiles found. Configure TWITTER_RELAY_BASE_URL on the server.")}
                  </p>
                )}
              </>
            )}
            <div className="flex justify-between pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPlatform(null);
                  setError("");
                }}
              >
                <ArrowLeft />
                {t("Back")}
              </Button>
              <Button disabled={busy || (platform === "twitter" && !profiles.length)}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                {t("Connect")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
