// Only this bridge runs inside the opaque iframe. Extension code runs in a dedicated Worker.
const bridge = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; connect-src 'none'">
<script>
addEventListener("message", async function start(event) {
  if (event.source !== parent || !event.ports[0]) return;
  removeEventListener("message", start);
  const port = event.ports[0];
  try {
    const url = code => URL.createObjectURL(new Blob([code], {type:"text/javascript"}));

    const bootstrap = 'const exports = {};\\n' + event.data.source + '\\nconst run = exports.default; self.onmessage = async event => { try { const {kind,text} = await run(event.data); if (!["inlineText","copyText"].includes(kind) || typeof text !== "string" || text.length > 65536) throw Error(); self.postMessage({kind,text}); } catch { self.postMessage(null); } };';
    const worker = new Worker(url(bootstrap));
    worker.onmessage = e => { port.postMessage(e.data); worker.terminate(); };
    worker.onerror = () => { port.postMessage(null); worker.terminate(); };
    worker.postMessage(event.data.input);
  } catch { port.postMessage(null); }
});
</script>`;
export type ActionResult = { kind: "copyText" | "inlineText"; text: string };
export function runIsolated(
  source: string,
  input: unknown,
  signal: AbortSignal,
): Promise<ActionResult> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.sandbox.add("allow-scripts");
    const channel = new MessageChannel();
    const stop = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      channel.port1.close();
      channel.port2.close();
      frame.remove();
    };
    const abort = () => {
      stop();
      reject(new DOMException("Plugin cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error("Plugin timed out"));
    }, 30000);
    signal.addEventListener("abort", abort, { once: true });
    channel.port1.onmessage = ({ data }) => {
      stop();
      if (
        !data ||
        !["inlineText", "copyText"].includes(data.kind) ||
        typeof data.text !== "string" ||
        data.text.length > 65536
      )
        reject(new Error("Invalid plugin output"));
      else resolve({ kind: data.kind, text: data.text });
    };
    frame.onload = () => frame.contentWindow?.postMessage({ source, input }, "*", [channel.port2]);
    frame.srcdoc = bridge;
    document.body.append(frame);
  });
}
