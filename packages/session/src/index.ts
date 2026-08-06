import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface BindingRecord {
  tokenHash: string;
  createdAt: string;
}

export interface BindingRepository {
  load(): Promise<BindingRecord | null>;
  save(record: BindingRecord): Promise<void>;
  clear(): Promise<void>;
}

export class FileBindingRepository implements BindingRepository {
  public constructor(private readonly stateFile: string) {}

  public async load(): Promise<BindingRecord | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.stateFile, "utf8"));
      if (!isBindingRecord(parsed)) return null;
      return parsed;
    } catch (error: unknown) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  public async save(record: BindingRecord): Promise<void> {
    await mkdir(dirname(this.stateFile), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.stateFile), 0o700);
    const temporaryFile = `${this.stateFile}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(record), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryFile, this.stateFile);
    await chmod(this.stateFile, 0o600);
  }

  public async clear(): Promise<void> {
    try {
      await unlink(this.stateFile);
    } catch (error: unknown) {
      if (!isMissingFile(error)) throw error;
    }
  }
}

export interface PairingCode {
  value: string;
  expiresAt: Date;
}

export type PairingResult =
  | { ok: true; token: string }
  | { ok: false; code: "INVALID_PAIRING_CODE" | "PAIRING_CODE_EXPIRED" | "PAIRING_CODE_USED" };

export class PairingManager {
  private activeCode: PairingCode | null = null;
  private consumedCodes = new Set<string>();
  private binding: BindingRecord | null = null;

  public constructor(
    private readonly repository: BindingRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly codeLifetimeMs = 5 * 60 * 1_000
  ) {}

  public async initialize(): Promise<void> {
    this.binding = await this.repository.load();
  }

  public openPairing(): PairingCode {
    const value = randomBytes(18).toString("base64url");
    const pairing = { value, expiresAt: new Date(this.now().getTime() + this.codeLifetimeMs) };
    this.activeCode = pairing;
    return pairing;
  }

  public async pair(code: string): Promise<PairingResult> {
    if (this.consumedCodes.has(code)) return { ok: false, code: "PAIRING_CODE_USED" };
    if (this.activeCode === null || !sameSecret(this.activeCode.value, code)) {
      return { ok: false, code: "INVALID_PAIRING_CODE" };
    }
    if (this.activeCode.expiresAt.getTime() <= this.now().getTime()) {
      return { ok: false, code: "PAIRING_CODE_EXPIRED" };
    }

    this.consumedCodes.add(code);
    this.activeCode = null;
    const token = randomBytes(32).toString("base64url");
    this.binding = { tokenHash: hashSecret(token), createdAt: this.now().toISOString() };
    await this.repository.save(this.binding);
    return { ok: true, token };
  }

  public isAuthenticated(token: string): boolean {
    return this.binding !== null && sameSecret(this.binding.tokenHash, hashSecret(token));
  }

  public async revoke(token: string): Promise<boolean> {
    if (!this.isAuthenticated(token)) return false;
    this.binding = null;
    await this.repository.clear();
    return true;
  }
}

export function defaultStateFile(dataDirectory: string): string {
  return join(dataDirectory, "binding.json");
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function sameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isBindingRecord(value: unknown): value is BindingRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.tokenHash === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(record.tokenHash) &&
    typeof record.createdAt === "string" &&
    !Number.isNaN(Date.parse(record.createdAt))
  );
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}
