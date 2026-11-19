import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { cachedModel, fileName, model, notifyModelChange } from "./model";

async function verify(file: File) {
  if (file.size !== model.bytes) throw new Error("Model verification failed");
  const reader = file.stream().getReader();
  const digest = sha256.create();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    digest.update(value);
  }
  if (bytesToHex(digest.digest()) !== model.sha256) throw new Error("Model verification failed");
}
async function save(root: FileSystemDirectoryHandle, file: File) {
  const handle = await root.getFileHandle(fileName, { create: true });
  await file.stream().pipeTo(await handle.createWritable());
  return handle.getFile();
}
export async function importModel(file: File) {
  await verify(file);
  const saved = await navigator.locks.request("flare-plamo-model", async () =>
    save(await navigator.storage.getDirectory(), file),
  );
  notifyModelChange();
  return saved;
}
type SyncFile = {
  getSize(): number;
  truncate(bytes: number): void;
  write(data: Uint8Array, options: { at: number }): number;
  close(): void;
  flush(): void;
};
async function receive(writer: SyncFile, start: number, progress: (bytes: number) => void) {
  let offset = start;
  const res = await fetch(model.url, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: offset ? { Range: "bytes=" + offset + "-" } : {},
  });
  if (!res.ok || !res.body) throw new Error("Model download failed");
  if (res.status === 200) {
    writer.truncate(0);
    offset = 0;
  } else if (
    res.status !== 206 ||
    !res.headers.get("content-range")?.startsWith("bytes " + offset + "-")
  ) {
    writer.truncate(0);
    throw new Error("Model download failed");
  }
  const reader = res.body.getReader();
  let reported = offset;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > model.bytes) {
        writer.truncate(0);
        throw new Error("Model verification failed");
      }
      const written = writer.write(value, { at: offset });
      if (written !== value.byteLength) throw new Error("Model download failed");
      offset += written;
      if (offset - reported > 4 * 1024 * 1024) {
        writer.flush();
        progress(offset);
        reported = offset;
      }
    }
  } catch (error) {
    // Keep what arrived so the next request can continue from it.
    if (error instanceof TypeError) writer.truncate(offset);
    throw error;
  }
  writer.flush();
  return offset;
}
export function getModel(allowDownload: boolean, progress: (bytes: number) => void) {
  return navigator.locks.request("flare-plamo-model", async () => {
    const existing = await cachedModel();
    if (existing) return existing;
    if (!allowDownload) throw new Error("Model download required");
    const root = await navigator.storage.getDirectory();
    const partial = (await root.getFileHandle(fileName + ".part", {
      create: true,
    })) as FileSystemFileHandle & {
      createSyncAccessHandle(): Promise<SyncFile>;
      move?: (name: string) => Promise<void>;
    };
    const writer = await partial.createSyncAccessHandle();
    try {
      let offset = writer.getSize();
      if (offset > model.bytes) {
        writer.truncate(0);
        offset = 0;
      }
      let failures = 0;
      while (offset < model.bytes) {
        const start = offset;
        try {
          offset = await receive(writer, offset, progress);
        } catch (error) {
          // A dropped connection resumes from the bytes already written. Other errors are final.
          if (!(error instanceof TypeError)) throw error;
          offset = writer.getSize();
          failures = offset > start ? 0 : failures + 1;
          if (failures > 3) throw new Error("Model download failed");
          writer.flush();
          continue;
        }
        if (offset !== model.bytes) throw new Error("Model download failed");
      }
    } finally {
      writer.close();
    }
    const file = await partial.getFile();
    try {
      await verify(file);
    } catch (error) {
      await root.removeEntry(fileName + ".part");
      throw error;
    }
    if (partial.move) {
      await partial.move(fileName);
      return (await root.getFileHandle(fileName)).getFile();
    }
    const saved = await save(root, file);
    await root.removeEntry(fileName + ".part");
    return saved;
  });
}
