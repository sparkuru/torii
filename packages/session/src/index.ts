import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isNavigationUrl, type BrowserTab, type ErrorCode, type SessionState } from "@torii/contracts";

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

export interface BrowserDriver {
  listTabs(): Promise<BrowserTab[]>;
  getTab(tabId: number): Promise<BrowserTab>;
  openTab(url: string): Promise<BrowserTab>;
  navigateTab(tabId: number, url: string): Promise<BrowserTab>;
}

export class SessionOperationError extends Error {
  public constructor(public readonly code: ErrorCode) {
    super(code);
  }
}

interface ActiveSession {
  id: string;
  intent: string;
  claimedTab: BrowserTab | null;
}

export class SessionManager {
  private activeSession: ActiveSession | null = null;
  private readonly listeners = new Set<(state: SessionState) => void>();

  public constructor(private readonly driver: BrowserDriver) {}

  public start(intent: string): { sessionId: string; status: "active" } {
    if (this.activeSession !== null) throw new SessionOperationError("SESSION_ALREADY_ACTIVE");
    this.activeSession = { id: randomUUID(), intent, claimedTab: null };
    this.emit();
    return { sessionId: this.activeSession.id, status: "active" };
  }

  public end(sessionId: string): { status: "ended" } {
    this.requireSession(sessionId);
    this.activeSession = null;
    this.emit();
    return { status: "ended" };
  }

  public endForTransportLoss(): void {
    if (this.activeSession === null) return;
    this.activeSession = null;
    this.emit();
  }

  public async listTabs(sessionId: string): Promise<BrowserTab[]> {
    this.requireSession(sessionId);
    return this.driver.listTabs();
  }

  public async claimTab(sessionId: string, tabId: number): Promise<BrowserTab> {
    const session = this.requireSession(sessionId);
    const tab = await this.driver.getTab(tabId);
    session.claimedTab = tab;
    this.emit();
    return tab;
  }

  public async openTab(sessionId: string, url: string): Promise<BrowserTab> {
    const session = this.requireSession(sessionId);
    this.requireNavigationUrl(url);
    const tab = await this.driver.openTab(url);
    session.claimedTab = tab;
    this.emit();
    return tab;
  }

  public async navigateTab(sessionId: string, tabId: number, url: string): Promise<BrowserTab> {
    const session = this.requireClaim(sessionId, tabId);
    this.requireNavigationUrl(url);
    try {
      const tab = await this.driver.navigateTab(tabId, url);
      session.claimedTab = tab;
      this.emit();
      return tab;
    } catch (error: unknown) {
      if (isSessionOperationError(error, "TAB_NOT_FOUND")) {
        session.claimedTab = null;
        this.emit();
      }
      throw error;
    }
  }

  public claimedTab(sessionId: string): BrowserTab {
    const session = this.requireSession(sessionId);
    if (session.claimedTab === null) throw new SessionOperationError("TAB_NOT_CLAIMED");
    return session.claimedTab;
  }

  public tabRemoved(tabId: number): void {
    if (this.activeSession?.claimedTab?.id !== tabId) return;
    this.activeSession.claimedTab = null;
    this.emit();
  }

  public state(): SessionState {
    if (this.activeSession === null) return { status: "idle" };
    return this.activeSession.claimedTab === null
      ? { status: "active" }
      : { status: "active", claimedTab: this.activeSession.claimedTab };
  }

  public subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private requireSession(sessionId: string): ActiveSession {
    if (this.activeSession === null || this.activeSession.id !== sessionId) {
      throw new SessionOperationError("SESSION_NOT_ACTIVE");
    }
    return this.activeSession;
  }

  private requireClaim(sessionId: string, tabId: number): ActiveSession {
    const session = this.requireSession(sessionId);
    if (session.claimedTab?.id !== tabId) throw new SessionOperationError("TAB_NOT_CLAIMED");
    return session;
  }

  private requireNavigationUrl(url: string): void {
    if (!isNavigationUrl(url)) throw new SessionOperationError("INVALID_URL");
  }

  private emit(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}

export function isSessionOperationError(error: unknown, code?: ErrorCode): error is SessionOperationError {
  return error instanceof SessionOperationError && (code === undefined || error.code === code);
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
