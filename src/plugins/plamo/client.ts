import { t } from "../../lib/i18n";
import { cachedModel, deleteModel, notifyModelChange } from "./model";
export { onModelChange } from "./model";
type Gpu = { requestAdapter(): Promise<{ features: Set<string> } | null> };
let worker: Worker | undefined;
let cancelActive: (() => void) | undefined;
let generation = 0;
let queue = Promise.resolve();
export class ModelMissing extends Error {}
function closeWorker() {
  worker?.terminate();
  worker = undefined;
}
export async function hasModel() {
  return !!(await cachedModel());
}
export async function removeModel() {
  generation++;
  cancelActive?.();
  closeWorker();
  await navigator.locks.request("flare-plamo-model", deleteModel);
  notifyModelChange();
}
async function requireGpu() {
  const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
  const adapter = await gpu?.requestAdapter();
  if (!adapter?.features.has("shader-f16"))
    throw new Error(t("WebGPU with shader-f16 is required on HTTPS or localhost."));
}
function serial<T>(run: () => Promise<T>) {
  const result = queue.then(run);
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}
// Sends one message to the shared worker and settles on its reply.
function request<T>(
  message: Record<string, unknown>,
  signal: AbortSignal,
  progress?: (bytes: number) => void,
): Promise<T> {
  if (!worker) worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const active = worker;
  return new Promise<T>((resolve, reject) => {
    function finish(error?: Error, value?: T) {
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
    const timeout = setTimeout(() => finish(new Error(t("Translation timed out"))), 10 * 60 * 1000);
    cancelActive = abort;
    active.onmessage = ({ data }) => {
      if (typeof data.progress === "number") {
        progress?.(data.progress);
        return;
      }
      if (data.error) finish(new Error(t(data.error)));
      else finish(undefined, data.text);
    };
    active.onerror = () => finish(new Error(t("Translation failed")));
    active.onmessageerror = active.onerror as () => void;
    signal.addEventListener("abort", abort, { once: true });
    active.postMessage(message);
  });
}
// Downloads and verifies the model without translating. Only call from an explicit user choice.
export function downloadModel(signal: AbortSignal, progress?: (bytes: number) => void) {
  const initialGeneration = generation;
  return serial(async () => {
    signal.throwIfAborted();
    await requireGpu();
    if (generation !== initialGeneration) throw new DOMException("Cancelled", "AbortError");
    await request({ download: true }, signal, progress);
    notifyModelChange();
  });
}
export function translate(
  text: string,
  language: string,
  signal: AbortSignal,
  progress?: (bytes: number) => void,
  options: { interactive?: boolean; onStart?: () => void } = {},
): Promise<string> {
  const { interactive = true } = options;
  const initialGeneration = generation;
  return serial(async () => {
    signal.throwIfAborted();
    // Automatic requests never prompt and never download: they wait for the reader's choice.
    const cached = await cachedModel();
    if (!cached && !interactive) throw new ModelMissing(t("Model download required"));
    await requireGpu();
    signal.throwIfAborted();
    if (generation !== initialGeneration) throw new DOMException("Cancelled", "AbortError");
    if (
      !cached &&
      !confirm(t("Download PLaMo 3 Translate (573 MB) from Hugging Face to this device?"))
    )
      throw new Error(t("Download cancelled"));
    options.onStart?.();
    const result = await request<string>(
      { text, language, allowDownload: !cached },
      signal,
      progress,
    );
    if (!cached) notifyModelChange();
    return result;
  });
}
