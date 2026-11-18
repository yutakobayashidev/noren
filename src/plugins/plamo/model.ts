export const model = {
  url: "https://huggingface.co/pfnet/plamo-3-translate-0.8b-GGUF/resolve/dbeb0856cb0b004b484f190bb71dd65876297013/plamo-3-translate-0.8b-Q4_K_M.gguf",
  bytes: 573123200,
  sha256: "923b2f28a9856de1b8b3b610a7e59ded0b14d007466fd5dd526e6a9ecaadafdd",
};
export const fileName = "flare-plamo-" + model.sha256;

export async function cachedModel(): Promise<File | undefined> {
  const root = await navigator.storage.getDirectory();
  try {
    const file = await (await root.getFileHandle(fileName)).getFile();
    return file.size === model.bytes ? file : undefined;
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return;
    throw e;
  }
}
export async function deleteModel() {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(fileName);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "NotFoundError")) throw e;
  }
}
