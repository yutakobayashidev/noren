import { postActions } from "./post-actions";
import { useState } from "react";
import { ArrowUpRight, Check, Plus, Search, Terminal, Workflow } from "lucide-react";
import { t } from "../lib/i18n";
import "./catalog.css";

import { readingPlugins } from "./reading";
const catalog = [
  ...postActions.map((a) => ({ ...a, category: t("Post action") })),
  ...readingPlugins,
];
const webMcp = {
  name: "WebMCP",
  publisher: "Flare Web",
  category: "Browser tools",
  description:
    "Let a browser assistant open a search across your connected accounts while Discover is open.",
  documentation: "https://developer.chrome.com/docs/ai/webmcp",
};

export function PluginCatalog({
  enabled,
  onEnable,
  actions,
  onActions,
}: {
  actions: string[];
  onActions: (ids: string[]) => void;
  enabled: boolean;
  onEnable: (value: boolean) => void;
}) {
  const [modelStatus, setModelStatus] = useState("");
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const matches =
    (!activeOnly || enabled) &&
    [webMcp.name, webMcp.publisher, t(webMcp.category), t(webMcp.description)]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  const matchingActions = catalog.filter(
    (a) =>
      (!activeOnly || actions.includes(a.grant)) &&
      (a.name + " " + a.author).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <section className="registry">
      <div className="registry-mast">
        <h1>{t("Plugin registry")}</h1>
        <a className="registry-create" href="/site/plugins/">
          {t("Build a plugin")} ↗
        </a>
        <label className="registry-search">
          <Search size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("Find plugins")}
            placeholder={t("Find plugins")}
          />
        </label>
      </div>
      <div className="registry-filters">
        {[
          [false, "All plugins", 1 + catalog.length],
          [
            true,
            "Enabled plugins",
            Number(enabled) + postActions.filter((a) => actions.includes(a.grant)).length,
          ],
        ].map(([active, label, count]) => (
          <button
            key={String(label)}
            aria-pressed={activeOnly === active}
            onClick={() => setActiveOnly(active === true)}
          >
            {t(String(label))}
            <span>{count}</span>
          </button>
        ))}
      </div>
      {matches ? (
        <article className="registry-entry">
          <div className="registry-cover" aria-hidden="true">
            <div className="registry-wire" />
            <div className="registry-stamp">
              <Terminal size={32} />
            </div>
            <div className="registry-emblem">
              <Workflow size={74} strokeWidth={1.45} />
            </div>
            <div className="registry-wordmark">
              WebMCP<span>↗</span>
            </div>
          </div>
          <div className="registry-detail">
            <div className="registry-category">{t(webMcp.category)}</div>
            <h2>{webMcp.name}</h2>
            <p>{t(webMcp.description)}</p>
            <dl className="registry-author">
              <dt>{t("Developer")}</dt>
              <dd>
                <img alt="" src="/flare.svg" />
                {webMcp.publisher}
              </dd>
            </dl>
            <div className="registry-actions">
              <button aria-pressed={enabled} onClick={() => onEnable(!enabled)}>
                {enabled ? <Check size={16} /> : <Plus size={16} />}{" "}
                {enabled ? t("Disable plugin") : t("Enable plugin")}
              </button>
              <a href={webMcp.documentation} target="_blank" rel="noreferrer">
                {t("Documentation")} <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
        </article>
      ) : null}
      {matchingActions.map((a) => (
        <article key={a.id} className="registry-action-entry">
          <div>
            <small>{a.category}</small>
            <h2>{a.name}</h2>
            {a.permissions && (
              <p>
                {t("Uses")} · {a.permissions.map(t).join(" · ")}
              </p>
            )}
            {a.id === "flare.plamo" && (
              <>
                <p>{t("Built with PLaMo. Translate on this device using WebGPU.")}</p>
                <a href="/runtime/sakutto-1.7.3/licenses/PLaMo-Community-License-en.txt">
                  {t("Model license")}
                </a>{" "}
                ·{" "}
                <button
                  onClick={async () => {
                    try {
                      const { removeModel } = await import("./plamo/client");
                      await removeModel();
                      setModelStatus(t("Model removed"));
                    } catch {
                      setModelStatus(t("Could not remove model"));
                    }
                  }}
                >
                  {t("Remove downloaded model")}
                </button>
                <span role="status">{modelStatus}</span>
              </>
            )}
            <p>
              {t("Developer")} · {a.author}
            </p>
          </div>
          <button
            onClick={() =>
              onActions(
                actions.includes(a.grant)
                  ? actions.filter((id) => id !== a.grant)
                  : [...actions, a.grant],
              )
            }
          >
            {t(actions.includes(a.grant) ? "Disable plugin" : "Enable plugin")}
          </button>
        </article>
      ))}
      {!matches && !matchingActions.length && (
        <div className="registry-empty" role="status">
          <Search size={24} />
          <p>{t(activeOnly && !enabled ? "No enabled plugins" : "No matching plugins")}</p>
          <button
            onClick={() => {
              setQuery("");
              setActiveOnly(false);
            }}
          >
            {t("All plugins")}
          </button>
        </div>
      )}
    </section>
  );
}
