import { getModel } from "./download";
interface Runtime {
  loadModel(blobs: Blob[], options: Record<string, unknown>): Promise<void>;
  createCompletion(options: {
    prompt: string;
    max_tokens: number;
    temperature: number;
    stream: true;
    stop: string[];
    onData: (chunk: { choices?: { text?: string }[] }) => void;
  }): Promise<void>;
}
let engine: Runtime | undefined;
async function load(allowDownload: boolean) {
  if (engine) return engine;
  const file = await getModel(allowDownload, (bytes) => self.postMessage({ progress: bytes }));
  const root = new URL("/runtime/sakutto-1.7.3/vendor/wllama/", location.origin);
  const asset = (name: string) => new URL(name, root).href;
  const { Wllama } = await import(/* @vite-ignore */ asset("wllama.js"));
  let engaged = false;
  const log = (...args: unknown[]) => {
    if (/using device WebGPU|offloaded [1-9]\d*\/\d+ layers to GPU/i.test(args.join(" ")))
      engaged = true;
  };
  const runtime: Runtime = new Wllama(
    {
      default: asset("wllama.wasm"),
      "wllama.worker.js": asset("wllama-worker.js"),
      "wllama.module.js": asset("wllama-module.js"),
      "wllama.pthread.js": asset("wllama-pthread.js"),
      "wllama.compat.js": asset("wllama-compat-module.js"),
      "wllama.compat.pthread.js": asset("wllama-compat-pthread.js"),
      "wllama.compat.wasm": asset("wllama-compat.wasm"),
    },
    { logger: { debug: log, log, warn: log, error: log }, suppressNativeLog: false },
  );
  await runtime.loadModel([file], {
    n_ctx: 4096,
    n_parallel: 1,
    n_gpu_layers: 99,
    n_threads: 1,
    swa_full: true,
    log_level: 2,
  });
  if (!engaged) throw new Error("WebGPU model loading failed");
  engine = runtime;
  return engine;
}
self.onmessage = async ({ data: { text, language, allowDownload, download } }) => {
  try {
    if (download) {
      await getModel(true, (bytes) => self.postMessage({ progress: bytes }));
      self.postMessage({ text: "" });
      return;
    }
    if (!text.trim() || text.includes("<|plamo:")) throw new Error("Unsupported post text");
    const runtime = await load(allowDownload);
    const prompt =
      "<|plamo:tag|>dataset<|plamo:msg|>translation<|plamo:tag|>input<|plamo:msg|>" +
      text +
      "<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>" +
      (language === "zh" ? "zh-hans" : language) +
      "<|plamo:msg|>";
    let output = "";
    await runtime.createCompletion({
      prompt,
      max_tokens: 1024,
      temperature: 0,
      stream: true,
      stop: ["<|plamo:tag|>", "<|plamo:bos|>"],
      onData: (chunk) => {
        output += chunk.choices?.[0]?.text ?? "";
      },
    });
    if (!output.trim()) throw new Error("Translation failed");
    self.postMessage({ text: output.trim() });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Translation failed" });
  }
};
