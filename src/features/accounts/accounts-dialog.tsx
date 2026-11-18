import { useState, useEffect } from "react";
import { Plus, LogOut, LoaderCircle, Check, ArrowLeft } from "lucide-react";
import type { Account, Platform } from "../../domain/model";
import { platformNames } from "../../domain/model";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  useEffect(() => {
    if (open) {
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
      await api("/api/accounts", { platform, ...values });
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
      await api(
        `/api/accounts/${encodeURIComponent(account.id)}`,
        undefined,
        "DELETE",
      );
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
          {platform ? "Add " + platformNames[platform] : "Your accounts"}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {platform
            ? "Connect an account to start reading and posting."
            : "Your social world, together in Flare."}
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
              {(["mastodon", "bluesky", "twitter"] as const).map((p) => (
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
            {platform === "mastodon" && (
              <>
                <label>
                  Server
                  <input
                    name="origin"
                    placeholder="mastodon.social"
                    required
                    autoComplete="url"
                  />
                </label>
                <label>
                  Access token
                  <input
                    name="token"
                    type="password"
                    required
                    autoComplete="off"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Create a token in your server’s Preferences → Development with
                  read, write and follow permissions.
                </p>
              </>
            )}
            {platform === "bluesky" && (
              <>
                <label>
                  Handle
                  <input
                    name="identifier"
                    placeholder="you.bsky.social"
                    required
                    autoComplete="username"
                  />
                </label>
                <label>
                  App password
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="off"
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                  />
                </label>
                <details className="text-sm">
                  <summary>Advanced</summary>
                  <label className="mt-3">
                    Server
                    <input
                      name="origin"
                      defaultValue="https://bsky.social"
                      required
                    />
                  </label>
                </details>
                <p className="text-xs text-muted-foreground">
                  Use an app password from Bluesky Settings → Privacy and
                  security → App passwords.
                </p>
              </>
            )}
            {platform === "twitter" && (
              <>
                {loadingProfiles ? (
                  <p className="text-sm text-muted-foreground">
                    Loading profiles…
                  </p>
                ) : profiles.length ? (
                  <label>
                    Relay profile
                    <select name="profile" required>
                      {profiles.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No relay profiles found. Configure TWITTER_RELAY_BASE_URL on
                    the server.
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
                Back
              </Button>
              <Button
                disabled={busy || (platform === "twitter" && !profiles.length)}
              >
                {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
                Connect
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
