import { ProfileLinks } from "./plugins/profile-links";
import { Watches, FollowUps, type Watch } from "./plugins/follow-ups";
import { Notes } from "./plugins/post-reading-tools";
import { EnabledActions } from "./plugins/post-actions";
import { PluginCatalog } from "./plugins/catalog";
import { webMcpSearch } from "./plugins/webmcp";
import { t, preference, changeLanguage } from "./lib/i18n";
import { useEffect, useState } from "react";
import {
  Home,
  Bell,
  Search,
  Settings,
  PenLine,
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
  Bookmark,
  Sun,
  Moon,
  ArrowLeft,
  LogOut,
  Users,
  LoaderCircle,
  SlidersHorizontal,
  X,
  LockKeyhole,
  AlignLeft,
} from "lucide-react";
import type { Account, SocialPost, Tab, FeedSource } from "./domain/model";
import { postIdentity, platformNames, supportsRecommended } from "./domain/model";
import { api, errorMessage } from "./lib/api";
import { useStored } from "./lib/storage";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./components/ui/dialog";
import { PlatformIcon, Avatar } from "./components/platform";
import { AccountsDialog } from "./features/accounts/accounts-dialog";
import { ComposeDialog } from "./features/compose/compose-dialog";
import { Timeline, type PostInteractions } from "./features/timeline/timeline";
import { PostCard } from "./features/timeline/post-card";
import { ThreadDialog } from "./features/timeline/thread-dialog";
import { Notifications } from "./features/timeline/notifications";
import { useTabSwipe } from "./features/timeline/use-tab-swipe";
import { TabDialog } from "./features/timeline/tab-dialog";

type Session = {
  authenticated: boolean;
  configured: boolean;
  development: boolean;
  preview?: boolean;
  user: { name: string; sub: string; issuer: string } | null;
};
type Route = {
  page: string;
  tab: string;
  query: string;
  profile: string;
  account: string;
};
function readRoute(): Route {
  const p = new URLSearchParams(location.hash.slice(1));
  return {
    page: p.get("page") || "home",
    tab: p.get("tab") || "mixed",
    query: p.get("q") || "",
    profile: p.get("profile") || "",
    account: p.get("account") || "",
  };
}
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = () =>
      api<Session>("/auth/me")
        .then(setSession)
        .catch((e) => setError(errorMessage(e)));
    void load();
    window.addEventListener("flare:session-expired", load);
    return () => window.removeEventListener("flare:session-expired", load);
  }, []);
  if (!session)
    return (
      <div className="login-page">
        <img src="/noren.svg" alt="" width="42" height="42" />
        <p role={error ? "alert" : "status"}>{error || t("Opening Noren…")}</p>
      </div>
    );
  if (!session.authenticated)
    return (
      <div className="login-page">
        <div className="login-card">
          <span className="brand-mark">
            <img src="/noren.svg" alt="" width="34" height="34" />
          </span>
          <h1>
            {t("Your social world.")}
            <br />
            {t("A little closer.")}
          </h1>
          <p>{t("Welcome to Noren. Sign in to bring your feeds together.")}</p>
          <div className="login-networks">
            <PlatformIcon platform="mastodon" size={26} />
            <PlatformIcon platform="bluesky" size={26} />
            <PlatformIcon platform="twitter" size={26} />
          </div>
          {session.configured ? (
            <Button size="lg" asChild>
              <a href="/auth/login">
                <LockKeyhole />
                {t("Sign in")}
              </a>
            </Button>
          ) : (
            <p className="setup-note">
              {t("Set OIDC_ISSUER and OIDC_CLIENT_ID on the server to enable sign-in.")}
            </p>
          )}
          <small>{t("Noren · An independent Android-inspired client")}</small>
        </div>
      </div>
    );
  return <Workspace key={`${session.user?.issuer}:${session.user?.sub}`} session={session} />;
}
function Workspace({ session }: { session: Session }) {
  const storageKey = `flare:${encodeURIComponent(session.user!.issuer)}:${encodeURIComponent(session.user!.sub)}`;
  const [webMcpEnabled, setWebMcpEnabled] = useStored(storageKey + ":webmcp", false);
  const [actions, setActions] = useStored<string[]>(storageKey + ":post-actions", []);
  const [route, setRoute] = useState(readRoute);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [guest, setGuest] = useState<Account | null>(null);
  const [accountsReady, setAccountsReady] = useState(false);
  const [error, setError] = useState("");
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabOpen, setTabOpen] = useState(false);
  const [reply, setReply] = useState<SocialPost>();
  const [thread, setThread] = useState<SocialPost | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [searchText, setSearchText] = useState(route.query);
  const [tabs, setTabs] = useStored<Tab[]>(`${storageKey}:tabs`, []);
  const [homeFeeds, setHomeFeeds] = useStored<Record<string, "latest" | "recommended">>(
    `${storageKey}:home-feeds`,
    {},
  );
  const [watches, setWatches] = useStored<Watch[]>(storageKey + ":follow-ups", []);
  const [notes, setNotes] = useStored<Record<string, string>>(storageKey + ":notes", {});
  const [noteQuery, setNoteQuery] = useState("");
  const [saved, setSaved] = useStored<SocialPost[]>(`${storageKey}:saved`, []);
  const [theme, setTheme] = useStored<"light" | "dark" | "system">(`${storageKey}:theme`, "system");
  const [layout, setLayout] = useStored<"list" | "grid" | "compact">(
    `${storageKey}:layout`,
    "grid",
  );
  useEffect(() => {
    const handler = () => {
      setRoute(readRoute());
      setSearchText(readRoute().query);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  async function loadAccounts() {
    try {
      const data = await api<{ accounts: Account[]; guest: Account }>("/api/accounts");
      setAccounts(data.accounts);
      setGuest(data.guest);
      setAccountsReady(true);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void loadAccounts();
  }, []);
  function navigate(update: Partial<Route>) {
    const next = { ...route, ...update };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key === "query" ? "q" : key, value);
    }
    location.hash = params.toString();
  }
  function compose(post?: SocialPost) {
    if (!accounts.length) {
      setAccountsOpen(true);
      return;
    }
    setReply(post);
    setComposeOpen(true);
  }
  const interactions: PostInteractions = {
    saved,
    onSave: (post) =>
      setSaved((old) =>
        old.some((p) => postIdentity(p) === postIdentity(post))
          ? old.filter((p) => postIdentity(p) !== postIdentity(post))
          : [post, ...old],
      ),
    onReply: compose,
    onThread: setThread,
    onProfile: (post) => {
      setThread(null);
      navigate({
        page: "profile",
        profile: post.author.handle,
        account: post.accountId,
      });
    },
  };
  const available = accounts.length ? accounts : guest ? [guest] : [];
  const activeTabs = tabs.filter((tab) => !tab.expiresAt || actions.includes("flare.event-tabs"));
  const showTimelineTabs = route.page === "home" || route.page === "discover";
  const timelineTabs = [
    { id: "mixed", label: t("Mixed"), icon: <PlatformIcon platform="mixed" /> },
    ...accounts.map((account) => ({
      id: account.id,
      label:
        accounts.filter((a) => a.platform === account.platform).length > 1
          ? account.displayName
          : platformNames[account.platform],
      icon: <PlatformIcon platform={account.platform} />,
    })),
    ...activeTabs.map((tab) => ({ id: tab.id, label: tab.title, icon: <List size={16} /> })),
  ];
  const swipe = useTabSwipe((offset) => {
    const index = timelineTabs.findIndex((tab) => tab.id === route.tab);
    const next = timelineTabs[index + offset];
    if (index >= 0 && next) navigate({ tab: next.id });
  });
  useEffect(() => {
    const deadlines = tabs.flatMap((tab) => (tab.expiresAt ? [tab.expiresAt] : []));
    if (!deadlines.length) return;
    const prune = () => {
      const now = Date.now();
      if (tabs.some((tab) => tab.expiresAt && tab.expiresAt <= now)) {
        setTabs((old) => old.filter((tab) => !tab.expiresAt || tab.expiresAt > now));
        if (tabs.some((tab) => tab.id === route.tab && tab.expiresAt && tab.expiresAt <= now))
          navigate({ tab: "mixed" });
      }
    };
    prune();
    const timer = setInterval(prune, 1000);
    return () => clearInterval(timer);
  }, [tabs, route.tab]);
  const custom = activeTabs.find((tab) => tab.id === route.tab);
  let selected =
    route.tab === "mixed"
      ? available
      : available.filter((account) => account.id === (custom?.accountId || route.tab));
  if (custom?.sources && route.page === "home")
    selected = available.filter((a) => Object.hasOwn(custom.sources!, a.id));
  if (route.page === "profile")
    selected = available.filter((account) => account.id === route.account);
  const rankedAccount =
    route.page === "home" && !custom
      ? accounts.find((a) => a.id === route.tab && supportsRecommended(a.platform))
      : undefined;
  const homeFeed = rankedAccount ? (homeFeeds[rankedAccount.id] ?? "latest") : "latest";
  const source: FeedSource =
    route.page === "discover"
      ? { kind: "search", query: route.query }
      : route.page === "profile"
        ? { kind: "user", target: route.profile }
        : (custom?.source ?? { kind: homeFeed === "recommended" ? "recommended" : "home" });
  const title =
    route.page === "plugins"
      ? t("Browse plugins")
      : route.page === "notifications"
        ? t("Notifications")
        : route.page === "discover"
          ? t("Discover")
          : route.page === "saved"
            ? t("Saved posts")
            : route.page === "profile"
              ? `@${route.profile}`
              : t("Home");
  const nav = [
    { id: "home", label: t("Home"), icon: Home },
    { id: "notifications", label: t("Notifications"), icon: Bell },
    { id: "discover", label: t("Discover"), icon: Search },
    { id: "saved", label: t("Saved"), icon: Bookmark },
  ];
  return (
    <Watches.Provider value={{ items: watches, change: setWatches }}>
      <Notes.Provider
        value={{ notes, change: (key, value) => setNotes((old) => ({ ...old, [key]: value })) }}
      >
        <EnabledActions.Provider value={actions}>
          <div className="app-shell">
            <aside className="navigation-rail" aria-label={t("Main navigation")}>
              <button
                className="rail-brand"
                onClick={() => navigate({ page: "home" })}
                aria-label={t("Noren home")}
              >
                <img src="/noren.svg" alt="" width="28" height="28" />
                <span>Noren</span>
              </button>
              <button className="compose-fab" onClick={() => compose()} aria-label={t("New post")}>
                <PenLine size={24} />
              </button>
              <nav>
                {nav.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-current={route.page === id ? "page" : undefined}
                    onClick={() => navigate({ page: id })}
                  >
                    <span>
                      <Icon size={23} />
                    </span>
                    <small>{label}</small>
                  </button>
                ))}
              </nav>
              <div className="rail-bottom">
                <button onClick={() => setAccountsOpen(true)} aria-label={t("Manage accounts")}>
                  <Avatar
                    name={accounts[0]?.displayName || session.user!.name}
                    url={accounts[0]?.avatarUrl}
                    size={38}
                  />
                </button>
                <button onClick={() => setSettingsOpen(true)} aria-label={t("Settings")}>
                  <Settings size={23} />
                  <small>{t("Settings")}</small>
                </button>
              </div>
            </aside>
            <main className={route.page === "plugins" ? "main-panel registry-panel" : "main-panel"}>
              {route.page === "plugins" ? (
                <header className="registry-chrome">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("Back to home")}
                    onClick={() => navigate({ page: "home" })}
                  >
                    <ArrowLeft />
                  </Button>
                  Noren / {t("Plugins")}
                </header>
              ) : (
                <header className="page-header">
                  <button
                    className="mobile-avatar"
                    aria-label={t("Manage accounts")}
                    onClick={() => setAccountsOpen(true)}
                  >
                    <Avatar
                      name={accounts[0]?.displayName || "F"}
                      url={accounts[0]?.avatarUrl}
                      size={34}
                    />
                  </button>
                  {(route.page === "profile" || route.page === "plugins") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Back to home")}
                      onClick={() => navigate({ page: "home", profile: "", account: "" })}
                    >
                      <ArrowLeft />
                    </Button>
                  )}
                  <h1>{title}</h1>
                  <div className="header-tools">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Refresh timeline")}
                      onClick={() => setRefresh((n) => n + 1)}
                    >
                      <RefreshCw />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("Timeline appearance")}
                      onClick={() => setSettingsOpen(true)}
                    >
                      <SlidersHorizontal />
                    </Button>
                    <Button
                      className="desktop-account-button"
                      variant="secondary"
                      onClick={() => setAccountsOpen(true)}
                    >
                      <Users />
                      {accounts.length
                        ? `${accounts.length} account${accounts.length === 1 ? "" : "s"}`
                        : t("Add account")}
                    </Button>
                  </div>
                </header>
              )}
              {session.development && (
                <div className="dev-indicator">
                  {t("Development session · OIDC is available when configured")}
                </div>
              )}
              {session.preview && (
                <div className="dev-indicator">
                  {t("Read-only preview · Trending on Mastodon")}
                  {session.configured && (
                    <>
                      {" "}
                      ·{" "}
                      <a href="/auth/login" className="underline">
                        {t("Sign in")}
                      </a>
                    </>
                  )}
                </div>
              )}
              {error && (
                <div role="alert" className="feed-error">
                  <p>{error}</p>
                  <Button size="sm" onClick={() => void loadAccounts()}>
                    {t("Retry")}
                  </Button>
                </div>
              )}
              {showTimelineTabs && (
                <div className="timeline-toolbar">
                  <div className="timeline-tabs" role="tablist" aria-label={t("Timelines")}>
                    {timelineTabs.map((tab) => (
                      <button
                        role="tab"
                        key={tab.id}
                        aria-selected={route.tab === tab.id}
                        onClick={() => navigate({ tab: tab.id })}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                    <button
                      className="add-tab"
                      aria-label={t("Add timeline")}
                      onClick={() => (accounts.length ? setTabOpen(true) : setAccountsOpen(true))}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  <div className="layout-controls" aria-label={t("Timeline layout")}>
                    {(
                      [
                        { id: "grid", label: t("Grid view"), icon: LayoutGrid },
                        { id: "list", label: t("List view"), icon: List },
                        { id: "compact", label: t("Compact view"), icon: AlignLeft },
                      ] as const
                    ).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        aria-label={label}
                        aria-pressed={layout === id}
                        onClick={() => setLayout(id)}
                      >
                        <Icon size={17} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rankedAccount && (
                <div className="feed-switch" role="group" aria-label={t("Home timeline")}>
                  {(
                    [
                      { id: "latest", label: t("Latest") },
                      { id: "recommended", label: t("Recommended") },
                    ] as const
                  ).map(({ id, label }) => (
                    <button
                      key={id}
                      aria-pressed={homeFeed === id}
                      onClick={() => setHomeFeeds((old) => ({ ...old, [rankedAccount.id]: id }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {route.page === "discover" && (
                <form
                  className="search-box"
                  {...(webMcpEnabled ? webMcpSearch : {})}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const query = String(new FormData(e.currentTarget).get("query") ?? "").trim();
                    if (!query) return;
                    setSearchText(query);
                    navigate({ query });
                    const submission = e.nativeEvent as SubmitEvent & {
                      respondWith?: (result: Promise<string>) => void;
                      agentInvoked?: boolean;
                    };
                    if (submission.agentInvoked)
                      submission.respondWith?.(
                        Promise.resolve("Opened search results for " + query),
                      );
                  }}
                >
                  <Search size={22} />
                  <input
                    name="query"
                    required
                    maxLength={1000}
                    aria-label={t("Search posts")}
                    placeholder={t("Search your social world")}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                  <Button type="submit" size="sm" disabled={!searchText.trim()}>
                    {t("Search")}
                  </Button>
                </form>
              )}
              <div
                className={
                  showTimelineTabs ? "feed-scroll touch-pan-y touch-pinch-zoom" : "feed-scroll"
                }
                {...(showTimelineTabs && swipe)}
                key={route.page + route.tab + route.query + route.profile}
              >
                {route.page === "profile" && actions.includes("flare.profile-links") && (
                  <ProfileLinks
                    accounts={available}
                    accountId={route.account}
                    handle={route.profile}
                    open={(account, profile) => navigate({ page: "profile", account, profile })}
                  />
                )}
                {route.page === "plugins" ? (
                  <PluginCatalog
                    actions={actions}
                    onActions={setActions}
                    enabled={webMcpEnabled}
                    onEnable={setWebMcpEnabled}
                  />
                ) : !accountsReady ? (
                  <div className="loading-state" role="status">
                    <LoaderCircle className="animate-spin" />
                    {t("Opening your timelines…")}
                  </div>
                ) : route.page === "notifications" ? (
                  <Notifications accounts={accounts} refresh={refresh} onThread={setThread} />
                ) : route.page === "saved" ? (
                  saved.length || (actions.includes("flare.updates") && watches.length) ? (
                    <div className={`timeline ${layout}`}>
                      {actions.includes("flare.updates") && <FollowUps refresh={refresh} />}
                      {actions.includes("flare.notes") && (
                        <label>
                          {t("Search private notes")}
                          <input
                            type="search"
                            value={noteQuery}
                            onChange={(e) => setNoteQuery(e.target.value)}
                          />
                        </label>
                      )}
                      {saved
                        .filter(
                          (p) =>
                            !actions.includes("flare.notes") ||
                            (notes[postIdentity(p)] ?? "")
                              .toLocaleLowerCase()
                              .includes(noteQuery.trim().toLocaleLowerCase()),
                        )
                        .map((post) => (
                          <PostCard
                            key={postIdentity(post)}
                            post={post}
                            {...interactions}
                            saved
                            onUpdate={(updated) =>
                              setSaved((old) =>
                                old.map((p) =>
                                  postIdentity(p) === postIdentity(updated) ? updated : p,
                                ),
                              )
                            }
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Bookmark size={30} />
                      <h2>{t("A place for the good stuff")}</h2>
                      <p>{t("Save a post to find it here later.")}</p>
                    </div>
                  )
                ) : route.page === "discover" && !route.query ? (
                  <div className="empty-state">
                    <Search size={32} />
                    <h2>{t("Follow your curiosity")}</h2>
                    <p>{t("Search posts across your connected accounts.")}</p>
                  </div>
                ) : !selected.length ? (
                  <div className="empty-state">
                    <Users size={30} />
                    <h2>{t("Connect this account")}</h2>
                    <p>{t("This timeline’s account is no longer connected.")}</p>
                    <Button onClick={() => setAccountsOpen(true)}>{t("Manage accounts")}</Button>
                  </div>
                ) : (
                  <Timeline
                    pullEnabled={showTimelineTabs}
                    sources={route.page === "home" ? custom?.sources : undefined}
                    preferencesKey={storageKey + ":feed-filter:" + route.page + ":" + route.tab}
                    accounts={selected}
                    source={source}
                    refresh={refresh}
                    layout={layout}
                    {...interactions}
                  />
                )}
              </div>
            </main>
            <nav className="mobile-navigation" aria-label={t("Mobile navigation")}>
              {nav.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  aria-current={route.page === id ? "page" : undefined}
                  onClick={() => navigate({ page: id })}
                >
                  <span>
                    <Icon size={21} />
                  </span>
                  <small>{label}</small>
                </button>
              ))}
            </nav>
            <button
              style={route.page === "plugins" ? { display: "none" } : undefined}
              className="mobile-compose"
              aria-label={t("Compose post")}
              onClick={() => compose()}
            >
              <PenLine size={25} />
            </button>
            <AccountsDialog
              open={accountsOpen}
              onOpenChange={setAccountsOpen}
              accounts={accounts}
              onChange={() => {
                void loadAccounts();
                setRefresh((n) => n + 1);
              }}
            />
            <ComposeDialog
              open={composeOpen}
              onOpenChange={setComposeOpen}
              accounts={accounts}
              reply={reply}
              onPublished={() => setRefresh((n) => n + 1)}
              storageKey={storageKey}
            />
            <ThreadDialog post={thread} onClose={() => setThread(null)} {...interactions} />
            <TabDialog
              open={tabOpen}
              onOpenChange={setTabOpen}
              accounts={accounts}
              onAdd={(tab) => {
                setTabs((old) => [...old, tab]);
                navigate({ page: "home", tab: tab.id });
              }}
            />
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogContent>
                <DialogTitle className="text-xl font-semibold">{t("Settings")}</DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground">
                  {t("Make Noren feel like home.")}
                </DialogDescription>
                <div className="mt-6 space-y-6">
                  <section>
                    <h2 className="settings-label">{t("Plugins")}</h2>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSettingsOpen(false);
                        navigate({ page: "plugins" });
                      }}
                    >
                      {t("Browse plugins")}
                    </Button>
                  </section>
                  <section>
                    <label>
                      {t("Language")}
                      <select value={preference} onChange={(e) => changeLanguage(e.target.value)}>
                        <option value="auto">{t("Browser default")}</option>
                        <option value="en">English</option>
                        <option value="ja">日本語</option>
                        <option value="zh">简体中文</option>
                      </select>
                    </label>
                    <h2 className="settings-label">{t("Appearance")}</h2>
                    <div className="segmented-control">
                      {(["light", "dark", "system"] as const).map((value) => (
                        <button
                          key={value}
                          aria-pressed={theme === value}
                          onClick={() => setTheme(value)}
                        >
                          {value === "light" ? (
                            <Sun size={17} />
                          ) : value === "dark" ? (
                            <Moon size={17} />
                          ) : (
                            <Settings size={17} />
                          )}
                          <span>{t(value)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h2 className="settings-label">{t("Timeline layout")}</h2>
                    <div className="segmented-control">
                      {(["grid", "list", "compact"] as const).map((value) => (
                        <button
                          key={value}
                          aria-pressed={layout === value}
                          onClick={() => setLayout(value)}
                        >
                          {t(value)}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h2 className="settings-label">{t("Accounts")}</h2>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSettingsOpen(false);
                        setAccountsOpen(true);
                      }}
                    >
                      <Users />
                      {t("Manage accounts")}
                    </Button>
                  </section>
                  {tabs.length > 0 && (
                    <section>
                      <h2 className="settings-label">{t("Custom timelines")}</h2>
                      {tabs.map((tab) => (
                        <div key={tab.id} className="flex items-center justify-between">
                          <span>{tab.title}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${tab.title}`}
                            onClick={() => {
                              setTabs((old) => old.filter((t) => t.id !== tab.id));
                              if (route.tab === tab.id) navigate({ tab: "mixed" });
                            }}
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                    </section>
                  )}
                  <div className="flex items-center justify-between border-t border-border pt-4">
                    <span className="text-sm text-muted-foreground">{session.user!.name}</span>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api("/auth/logout", {});
                        location.reload();
                      }}
                    >
                      <LogOut />
                      {t("Sign out")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <a href="/licenses/index.html">
                      {t("Noren · Based on Flare for Android · AGPL-3.0")}
                    </a>
                  </p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </EnabledActions.Provider>
      </Notes.Provider>
    </Watches.Provider>
  );
}
