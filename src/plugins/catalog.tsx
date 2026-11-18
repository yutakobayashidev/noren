import { useState } from "react";
import { Blocks, Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { t } from "../lib/i18n";

export function PluginCatalog({
  enabled,
  onEnable,
}: {
  enabled: boolean;
  onEnable: (enabled: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const title = t("WebMCP search in Discover");
  const description = t(
    "Let a browser assistant open a search across your connected accounts while Discover is open.",
  );
  const matches = (title + " " + description)
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
  return (
    <section className="mx-auto max-w-2xl space-y-5 p-4">
      <label className="search-box">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("Find plugins")}
          placeholder={t("Find plugins")}
        />
      </label>
      {matches ? (
        <article className="space-y-4 rounded-3xl border border-border bg-card p-5">
          <Blocks aria-hidden="true" size={28} />
          <h2 className="text-lg font-semibold">{title}</h2>
          <p>{description}</p>
          <Button
            variant={enabled ? "secondary" : "default"}
            onClick={() => onEnable(!enabled)}
          >
            {enabled ? t("Disable plugin") : t("Enable plugin")}
          </Button>
        </article>
      ) : (
        <p role="status">{t("No matching plugins")}</p>
      )}
    </section>
  );
}
