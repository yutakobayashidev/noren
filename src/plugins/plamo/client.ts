import { t } from "../../lib/i18n";
import { cachedModel, deleteModel } from "./model";
type Gpu = { requestAdapter(): Promise<{ features: Set<string> } | null> };
let worker: Worker | undefined;
let cancelActive: (() => void) | undefined;
let generation = 0;
let queue = Promise.resolve();
function closeWorker() {
  worker?.terminate();
  worker = undefined;
}
export async function removeModel() {
  generation++;
  cancelActive?.();
  closeWorker();
  await navigator.locks.request("flare-plamo-model", deleteModel);
}
export function translate(text: string, language: string, signal: AbortSignal): Promise<string> {
  const initialGeneration = generation;
  const run = async () => {
    signal.throwIfAborted();
    const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
    const adapter = await gpu?.requestAdapter();
    if (!adapter?.features.has("shader-f16"))
      throw new Error(t("WebGPU with shader-f16 is required on HTTPS or localhost."));
    const cached = await cachedModel();
    signal.throwIfAborted();
    if (generation !== initialGeneration) throw new DOMException("Cancelled", "AbortError");
    if (
      !cached &&
      !confirm(t("Download PLaMo 3 Translate (573 MB) from Hugging Face to this device?"))
    )
      throw new Error(t("Download cancelled"));
    if (!worker) worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const active = worker;
    return new Promise<string>((resolve, reject) => {
      function finish(error?: Error, value?: string) {
        cancelActive = undefined;
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        active.onmessage = null;
        active.onerror = null;
        active.onmessageerror = null;
        if (error) {
          closeWorker();
          reject(error);
        } else resolve(value!);
      }
      const abort = () => finish(new DOMException("Cancelled", "AbortError"));
      const timeout = setTimeout(
        () => finish(new Error(t("Translation timed out"))),
        10 * 60 * 1000,
      );
      cancelActive = abort;
      active.onmessage = ({ data }) =>
        data.error ? finish(new Error(t(data.error))) : finish(undefined, data.text);
      active.onerror = () => finish(new Error(t("Translation failed")));
      active.onmessageerror = active.onerror as () => void;
      signal.addEventListener("abort", abort, { once: true });
      active.postMessage({ text, language, allowDownload: !cached });
    });
  };
  const result = queue.then(run);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
