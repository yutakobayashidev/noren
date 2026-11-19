import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import type { AutoTranslateSettings } from "./auto";
import { targetLanguages } from "./language";
import { model } from "./model";

const languageNames = { ja: "日本語", en: "English", zh: "简体中文" };
const megabytes = (bytes: number) => Math.round(bytes / 1000000);

export function PlamoSettings({
  enabled,
  settings,
  onSettings,
}: {
  enabled: boolean;
  settings: AutoTranslateSettings;
  onSettings: (value: AutoTranslateSettings) => void;
}) {
  const [ready, setReady] = useState<boolean>();
  const [status, setStatus] = useState("");
  const [downloaded, setDownloaded] = useState<number>();
  const job = useRef<AbortController | null>(null);
  useEffect(() => {
    let live = true;
    let stop = () => {};
    const refresh = async () => {
      const { hasModel } = await import("./client");
      const value = await hasModel().catch(() => false);
      if (live) setReady(value);
    };
    void import("./client").then(({ onModelChange }) => {
      if (live) stop = onModelChange(refresh);
    });
    void refresh();
    return () => {
      live = false;
      stop();
      job.current?.abort();
    };
  }, []);
  async function download() {
    if (job.current) {
      job.current.abort();
      return;
    }
    const controller = new AbortController();
    job.current = controller;
    setDownloaded(0);
    setStatus("");
    try {
      const { downloadModel } = await import("./client");
      await downloadModel(controller.signal, setDownloaded);
      setStatus(t("Model ready"));
    } catch (error) {
      setStatus(
        controller.signal.aborted
          ? t("Download cancelled")
          : error instanceof Error
            ? error.message
            : t("Model download failed"),
      );
    } finally {
      job.current = null;
      setDownloaded(undefined);
    }
  }
  return (
    <div className="plamo-settings">
      <p>{t("Built with PLaMo. Translate on this device using WebGPU.")}</p>
      <fieldset disabled={!enabled}>
        <legend>{t("Automatic translation")}</legend>
        <label className="plamo-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onSettings({ ...settings, enabled: e.target.checked })}
          />
          {t("Translate posts in other languages as they appear")}
        </label>
        <label className="plamo-language">
          {t("Translate into")}
          <select
            value={settings.language}
            onChange={(e) =>
              onSettings({
                ...settings,
                language: e.target.value as AutoTranslateSettings["language"],
              })
            }
          >
            {targetLanguages.map((code) => (
              <option key={code} value={code}>
                {languageNames[code]}
              </option>
            ))}
          </select>
        </label>
        {!enabled && <p>{t("Enable the plugin to change these settings.")}</p>}
      </fieldset>
      <div className="plamo-model">
        <p>
          PLaMo 3 Translate · {megabytes(model.bytes)} MB · Hugging Face ·{" "}
          {ready === undefined ? "…" : ready ? t("On this device") : t("Not downloaded")}
        </p>
        {ready === false && (
          <>
            <p>
              {t(
                "Automatic translation starts after you download the model. Nothing is downloaded or translated before then.",
              )}
            </p>
            <button onClick={download}>
              {downloaded === undefined
                ? t("Download model") + ` (${megabytes(model.bytes)} MB)`
                : t("Cancel") + ` · ${megabytes(downloaded)} / ${megabytes(model.bytes)} MB`}
            </button>
          </>
        )}
        {ready && (
          <button
            onClick={async () => {
              try {
                const { removeModel } = await import("./client");
                await removeModel();
                setStatus(t("Model removed"));
              } catch {
                setStatus(t("Could not remove model"));
              }
            }}
          >
            {t("Remove downloaded model")}
          </button>
        )}
        <label>
          {t("Import verified GGUF")}
          <input
            type="file"
            accept=".gguf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const { importModel } = await import("./download");
                await importModel(file);
                setReady(true);
                setStatus(t("Model ready"));
              } catch (error) {
                setStatus(t(error instanceof Error ? error.message : "Model verification failed"));
              }
            }}
          />
        </label>
        <a href="/runtime/sakutto-1.7.3/licenses/PLaMo-Community-License-en.txt">
          {t("Model license")}
        </a>
        <span role="status">{status}</span>
      </div>
    </div>
  );
}
