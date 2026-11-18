import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import type { Account } from "../src/domain/model";

export type StoredAccount = Account & {
  token?: string;
  session?: unknown;
  profile?: string;
  relays?: string[];
  publicKey?: string;
};
// Native Flare AccountRepository semantics: credentials belong to one account, never to a tab.
export class AccountStore {
  private key: Buffer;
  private file: string;
  private values: StoredAccount[];
  constructor(directory = process.env.FLARE_DATA_DIR || ".data") {
    const dir = resolve(directory);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const keyFile = join(dir, "credential.key");
    if (!existsSync(keyFile))
      writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: "wx" });
    this.key = readFileSync(keyFile);
    this.file = join(dir, "accounts.enc");
    this.values = [];
    if (existsSync(this.file)) {
      const data = readFileSync(this.file);
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        data.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from("flare-web:accounts:v1"));
      decipher.setAuthTag(data.subarray(12, 28));
      this.values = JSON.parse(
        Buffer.concat([
          decipher.update(data.subarray(28)),
          decipher.final(),
        ]).toString(),
      ).filter((account: { platform: string }) => account.platform !== "rss");
    }
  }
  all() {
    return this.values;
  }
  public() {
    return this.values.map(
      ({ token, session, profile, relays, publicKey, ...account }) => account,
    );
  }
  get(id: string) {
    const account = this.values.find((item) => item.id === id);
    if (!account) throw new Error("Account not found.");
    return account;
  }
  put(account: StoredAccount) {
    this.values = [
      ...this.values.filter((item) => item.id !== account.id),
      account,
    ];
    this.save();
  }
  remove(id: string) {
    this.values = this.values.filter((item) => item.id !== id);
    this.save();
  }
  private save() {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from("flare-web:accounts:v1"));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(this.values)),
      cipher.final(),
    ]);
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(
      temporary,
      Buffer.concat([iv, cipher.getAuthTag(), encrypted]),
      { mode: 0o600 },
    );
    renameSync(temporary, this.file);
  }
}
