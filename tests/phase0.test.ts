import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  clientMessageSchema,
  serverMessageSchema,
  type BrowserCommand,
  type BrowserCommandResult,
  type BrowserTab,
  type ClientMessage,
  type ServerMessage
} from "@torii/contracts";
import {
  FileBindingRepository,
  PairingManager,
  SessionManager,
  SessionOperationError,
  defaultStateFile,
  type BindingRecord,
  type BindingRepository,
  type BrowserDriver
} from "@torii/session";
import { PairingBroker } from "../apps/mcp-server/src/broker.js";
import { WebExtensionDriver } from "../apps/mcp-server/src/driver-webext.js";
import { parseBrokerPort, startTorii } from "../apps/mcp-server/src/server.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

test("pairing codes are single-use and revocation invalidates their binding", async () => {
  const repository = new MemoryRepository();
  const manager = new PairingManager(repository);
  await manager.initialize();
  const code = manager.openPairing();

  const firstPairing = await manager.pair(code.value);
  assert.equal(firstPairing.ok, true);
  if (!firstPairing.ok) return;
  assert.equal(manager.isAuthenticated(firstPairing.token), true);
  assert.deepEqual(await manager.pair(code.value), { ok: false, code: "PAIRING_CODE_USED" });
  assert.equal(await manager.revoke(firstPairing.token), true);
  assert.equal(manager.isAuthenticated(firstPairing.token), false);
  assert.equal(await repository.load(), null);
});

test("expired and incorrect pairing codes never establish a binding", async () => {
  const start = new Date("2026-08-06T00:00:00.000Z");
  let now = start;
  const manager = new PairingManager(new MemoryRepository(), () => now, 1_000);
  await manager.initialize();
  const code = manager.openPairing();

  assert.deepEqual(await manager.pair("x".repeat(24)), { ok: false, code: "INVALID_PAIRING_CODE" });
  now = new Date(start.getTime() + 1_000);
  assert.deepEqual(await manager.pair(code.value), { ok: false, code: "PAIRING_CODE_EXPIRED" });
});

test("binding persistence has owner-only permissions and revocation removes it", async () => {
  const directory = await temporaryDirectory();
  const repository = new FileBindingRepository(defaultStateFile(directory));
  const manager = new PairingManager(repository);
  await manager.initialize();
  const result = await manager.pair(manager.openPairing().value);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const stateFile = defaultStateFile(directory);
  assert.match(await readFile(stateFile, "utf8"), /tokenHash/);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(stateFile)).mode & 0o777, 0o600);
  await manager.revoke(result.token);
  await assert.rejects(readFile(stateFile, "utf8"), { code: "ENOENT" });
});

test("broker pairs, reconnects, revokes, and rejects the revoked token", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  const broker = new PairingBroker({ pairingManager: manager, port: 0 });
  await broker.start();
  try {
    const address = broker.address();
    assert.deepEqual(address?.host, "127.0.0.1");
    assert.notEqual(address?.port, 32145);
    const code = manager.openPairing();
    const paired = await request(address?.port, { kind: "pair", code: code.value });
    assert.equal(paired.kind, "paired");
    if (paired.kind !== "paired") return;

    assert.deepEqual(await request(address?.port, { kind: "authenticate", token: paired.token }), { kind: "authenticated" });
    assert.deepEqual(await request(address?.port, { kind: "revoke", token: paired.token }), { kind: "revoked" });
    assert.deepEqual(await request(address?.port, { kind: "authenticate", token: paired.token }), {
      kind: "error",
      code: "BINDING_REVOKED"
    });
  } finally {
    await broker.close();
  }
});

test("broker refuses a non-loopback host and the production port fails when occupied", async () => {
  const manager = new PairingManager(new MemoryRepository());
  assert.throws(
    () => new PairingBroker({ pairingManager: manager, host: "0.0.0.0" as never }),
    /127\.0\.0\.1/
  );

  const occupied = new PairingBroker({ pairingManager: manager, port: 32145 });
  await occupied.start();
  try {
    const directory = await temporaryDirectory();
    await assert.rejects(startTorii({ stateDirectory: directory, connectStdio: false }), /EADDRINUSE/);
  } finally {
    await occupied.close();
  }
});

test("runtime defaults to the fixed loopback production endpoint", async () => {
  const directory = await temporaryDirectory();
  const runtime = await startTorii({ stateDirectory: directory, connectStdio: false });
  try {
    assert.deepEqual(runtime.broker.address(), { host: "127.0.0.1", port: 32145 });
    assert.match(runtime.pairingCode.value, /^[A-Za-z0-9_-]{24}$/);
  } finally {
    await runtime.close();
  }
});

test("an explicit alternate port is valid while the default remains fixed", () => {
  assert.equal(parseBrokerPort(undefined), 32145);
  assert.equal(parseBrokerPort("32146"), 32146);
  for (const value of ["0", "65536", "-1", "32145.5", "port"]) {
    assert.throws(() => parseBrokerPort(value), /TORII_BROKER_PORT/);
  }
});

test("the stdio process completes MCP initialization without stdout diagnostics", async () => {
  const directory = await temporaryDirectory();
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "apps/mcp-server/src/cli.ts"],
    cwd: process.cwd(),
    env: { ...process.env, TORII_STATE_DIR: directory },
    stderr: "pipe"
  });
  const client = new Client({ name: "torii-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["browser_start_session", "browser_end_session", "browser_list_tabs", "browser_claim_tab", "browser_open", "browser_navigate"]
    );
    const started = await client.callTool({ name: "browser_start_session", arguments: { intent: "test tab ownership" } });
    const startedResult = CallToolResultSchema.parse(started);
    assert.equal(startedResult.isError, undefined);
    const firstContent = startedResult.content[0];
    const payload = JSON.parse(firstContent?.type === "text" ? firstContent.text : "{}") as { session_id: string };
    const ended = await client.callTool({ name: "browser_end_session", arguments: { session_id: payload.session_id } });
    assert.equal(CallToolResultSchema.parse(ended).isError, undefined);
  } finally {
    await transport.close();
  }
});

test("one active session replaces its claim and never sends foreign navigation to the driver", async () => {
  const driver = new FakeDriver();
  const sessions = new SessionManager(driver);
  const first = sessions.start("research");
  assert.throws(() => sessions.start("second"), (error: unknown) => hasCode(error, "SESSION_ALREADY_ACTIVE"));
  await sessions.claimTab(first.sessionId, 1);
  await assert.rejects(sessions.navigateTab(first.sessionId, 2, "https://example.test/other"), (error: unknown) => hasCode(error, "TAB_NOT_CLAIMED"));
  assert.equal(driver.navigateCalls, 0);

  const opened = await sessions.openTab(first.sessionId, "https://new.example.test/");
  assert.equal(opened.id, 3);
  await assert.rejects(sessions.navigateTab(first.sessionId, 1, "https://example.test/old"), (error: unknown) => hasCode(error, "TAB_NOT_CLAIMED"));
  assert.equal(driver.navigateCalls, 0);

  sessions.tabRemoved(3);
  await assert.rejects(sessions.navigateTab(first.sessionId, 3, "https://new.example.test/again"), (error: unknown) => hasCode(error, "TAB_NOT_CLAIMED"));
  await assert.rejects(sessions.openTab(first.sessionId, "file:///tmp/not-allowed"), (error: unknown) => hasCode(error, "INVALID_URL"));
  assert.equal(driver.openCalls, 1);

  sessions.end(first.sessionId);
  await assert.rejects(sessions.listTabs(first.sessionId), (error: unknown) => hasCode(error, "SESSION_NOT_ACTIVE"));
});

test("missing claimed tabs clear the claim after a failed navigation", async () => {
  const driver = new FakeDriver();
  const sessions = new SessionManager(driver);
  const active = sessions.start("research");
  await sessions.claimTab(active.sessionId, 1);
  driver.failNavigationWithMissingTab = true;
  await assert.rejects(sessions.navigateTab(active.sessionId, 1, "https://example.test/next"), (error: unknown) => hasCode(error, "TAB_NOT_FOUND"));
  assert.deepEqual(sessions.state(), { status: "active" });
  assert.equal(driver.navigateCalls, 1);
});

test("broker correlates commands only through an authenticated addon socket", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  const broker = new PairingBroker({ pairingManager: manager, port: 0 });
  await broker.start();
  try {
    const port = broker.address()?.port;
    assert.notEqual(port, undefined);
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const code = manager.openPairing();
    const command = new Promise<void>((resolve, reject) => {
      socket.on("message", (data) => {
        const message = serverMessageSchema.parse(JSON.parse(data.toString()));
        if (message.kind === "paired") {
          void broker.dispatchCommand({ kind: "list-tabs" }).then((result) => {
            assert.deepEqual(result, { kind: "tabs", tabs: [] });
            resolve();
          }, reject);
        }
        if (message.kind === "command") {
          socket.send(JSON.stringify({ kind: "command-result", requestId: message.requestId, result: { kind: "tabs", tabs: [] } }));
        }
      });
      socket.once("error", reject);
    });
    await new Promise<void>((resolve) => socket.once("open", resolve));
    socket.send(JSON.stringify({ kind: "pair", code: code.value }));
    await command;
    socket.close();
  } finally {
    await broker.close();
  }
});

test("broker preserves a session only for a same-binding reconnect during the grace window", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  let sessionEnds = 0;
  const broker = new PairingBroker({ pairingManager: manager, port: 0, onAuthenticatedTransportLost: () => sessionEnds += 1 });
  await broker.start();
  try {
    const port = broker.address()?.port;
    assert.notEqual(port, undefined);
    const code = manager.openPairing();
    const first = await persistentRequest(port, { kind: "pair", code: code.value });
    assert.equal(first.message.kind, "paired");
    if (first.message.kind !== "paired") return;
    first.socket.close();
    await onceClosed(first.socket);

    assert.equal(sessionEnds, 0);
    assert.deepEqual(await broker.dispatchCommand({ kind: "list-tabs" }), { kind: "error", code: "DRIVER_UNAVAILABLE" });

    const second = await persistentRequest(port, { kind: "authenticate", token: first.message.token });
    assert.deepEqual(second.message, { kind: "authenticated" });
    assert.equal(sessionEnds, 0);
    second.socket.close();
  } finally {
    await broker.close();
  }
});

test("failed authentication ends a pending reconnect grace instead of resuming its session", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  let sessionEnds = 0;
  const broker = new PairingBroker({ pairingManager: manager, port: 0, onAuthenticatedTransportLost: () => sessionEnds += 1 });
  await broker.start();
  try {
    const port = broker.address()?.port;
    assert.notEqual(port, undefined);
    const first = await persistentRequest(port, { kind: "pair", code: manager.openPairing().value });
    first.socket.close();
    await onceClosed(first.socket);
    assert.equal(sessionEnds, 0);

    const rejected = await persistentRequest(port, { kind: "authenticate", token: "x".repeat(43) });
    assert.deepEqual(rejected.message, { kind: "error", code: "BINDING_REVOKED" });
    assert.equal(sessionEnds, 1);
    rejected.socket.close();
  } finally {
    await broker.close();
  }
});

test("invalid authentication cannot end a session with a live authenticated socket", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  let sessionEnds = 0;
  const broker = new PairingBroker({ pairingManager: manager, port: 0, onAuthenticatedTransportLost: () => sessionEnds += 1 });
  await broker.start();
  try {
    const first = await persistentRequest(broker.address()?.port, { kind: "pair", code: manager.openPairing().value });
    const rejected = await persistentRequest(broker.address()?.port, { kind: "authenticate", token: "x".repeat(43) });
    assert.deepEqual(rejected.message, { kind: "error", code: "BINDING_REVOKED" });
    assert.equal(sessionEnds, 0);
    rejected.socket.close();
    first.socket.close();
  } finally {
    await broker.close();
  }
});

test("pairing replacement ends a pending reconnect grace", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  let sessionEnds = 0;
  const broker = new PairingBroker({ pairingManager: manager, port: 0, onAuthenticatedTransportLost: () => sessionEnds += 1 });
  await broker.start();
  try {
    const first = await persistentRequest(broker.address()?.port, { kind: "pair", code: manager.openPairing().value });
    first.socket.close();
    await onceClosed(first.socket);

    const replacement = await persistentRequest(broker.address()?.port, { kind: "pair", code: manager.openPairing().value });
    assert.equal(replacement.message.kind, "paired");
    assert.equal(sessionEnds, 1);
    replacement.socket.close();
  } finally {
    await broker.close();
  }
});

test("revocation and shutdown end a session without waiting for reconnect grace", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  let sessionEnds = 0;
  const broker = new PairingBroker({ pairingManager: manager, port: 0, onAuthenticatedTransportLost: () => sessionEnds += 1 });
  await broker.start();
  let closed = false;
  try {
    const first = await persistentRequest(broker.address()?.port, { kind: "pair", code: manager.openPairing().value });
    if (first.message.kind !== "paired") throw new Error("Pairing did not return a binding");
    const revoked = await persistentRequest(broker.address()?.port, { kind: "revoke", token: first.message.token });
    assert.deepEqual(revoked.message, { kind: "revoked" });
    assert.equal(sessionEnds, 1);
    revoked.socket.close();
    await broker.close();
    closed = true;
    assert.equal(sessionEnds, 2);
  } finally {
    if (!closed) await broker.close();
  }
});

test("reconnect grace ends the session after its fixed ten-second deadline", async () => {
  const manager = new PairingManager(new MemoryRepository());
  await manager.initialize();
  let sessionEnds = 0;
  const broker = new PairingBroker({ pairingManager: manager, port: 0, onAuthenticatedTransportLost: () => sessionEnds += 1 });
  await broker.start();
  try {
    const first = await persistentRequest(broker.address()?.port, { kind: "pair", code: manager.openPairing().value });
    first.socket.close();
    await onceClosed(first.socket);
    await new Promise<void>((resolve) => setTimeout(resolve, 10_050));
    assert.equal(sessionEnds, 1);
    assert.deepEqual(await broker.dispatchCommand({ kind: "list-tabs" }), { kind: "error", code: "DRIVER_UNAVAILABLE" });
  } finally {
    await broker.close();
  }
});

test("web extension driver returns the tab metadata supplied after open and navigation", async () => {
  const transport = new RecordingTransport([
    { kind: "tab", tab: { id: 3, title: "Loaded new tab", url: "https://new.example.test/", active: true } },
    { kind: "tab", tab: { id: 3, title: "Destination title", url: "https://destination.example.test/", active: true } }
  ]);
  const driver = new WebExtensionDriver(transport);

  assert.deepEqual(await driver.openTab("https://new.example.test/"), {
    id: 3,
    title: "Loaded new tab",
    url: "https://new.example.test/",
    active: true
  });
  assert.deepEqual(await driver.navigateTab(3, "https://destination.example.test/"), {
    id: 3,
    title: "Destination title",
    url: "https://destination.example.test/",
    active: true
  });
  assert.deepEqual(transport.commands, [
    { kind: "open-tab", url: "https://new.example.test/" },
    { kind: "navigate-tab", tabId: 3, url: "https://destination.example.test/" }
  ]);
});

test("web extension driver preserves bounded navigation failures", async () => {
  const driver = new WebExtensionDriver(
    new RecordingTransport([
      { kind: "error", code: "DRIVER_TIMEOUT" },
      { kind: "error", code: "TAB_NOT_FOUND" }
    ])
  );

  await assert.rejects(driver.openTab("https://new.example.test/"), (error: unknown) => hasCode(error, "DRIVER_TIMEOUT"));
  await assert.rejects(
    driver.navigateTab(3, "https://destination.example.test/"),
    (error: unknown) => hasCode(error, "TAB_NOT_FOUND")
  );
});

test("addon manifest limits worker wakeup to the alarms permission", async () => {
  const manifest = JSON.parse(await readFile(join(process.cwd(), "apps/firefox-addon/manifest.json"), "utf8")) as {
    permissions: string[];
    host_permissions: string[];
  };
  assert.deepEqual(manifest.permissions, ["storage", "tabs", "alarms"]);
  assert.deepEqual(manifest.host_permissions, ["ws://127.0.0.1/*"]);
  for (const forbidden of ["activeTab", "scripting", "debugger", "history", "bookmarks", "cookies", "downloads", "nativeMessaging"]) {
    assert.equal(manifest.permissions.includes(forbidden), false);
  }
});

async function request(port: number | undefined, message: ClientMessage): Promise<ServerMessage> {
  assert.notEqual(port, undefined);
  clientMessageSchema.parse(message);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.once("open", () => socket.send(JSON.stringify(message)));
    socket.once("message", (data) => {
      socket.close();
      try {
        resolve(serverMessageSchema.parse(JSON.parse(data.toString())));
      } catch (error: unknown) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

async function persistentRequest(port: number | undefined, message: ClientMessage): Promise<{ socket: WebSocket; message: ServerMessage }> {
  assert.notEqual(port, undefined);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.once("open", () => socket.send(JSON.stringify(message)));
    socket.once("message", (data) => {
      try {
        resolve({ socket, message: serverMessageSchema.parse(JSON.parse(data.toString())) });
      } catch (error: unknown) {
        socket.close();
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

async function onceClosed(socket: WebSocket): Promise<void> {
  if (socket.readyState === socket.CLOSED) return;
  await new Promise<void>((resolve) => socket.once("close", resolve));
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "torii-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

class MemoryRepository implements BindingRepository {
  private record: BindingRecord | null = null;

  public async load(): Promise<BindingRecord | null> {
    return this.record;
  }

  public async save(record: BindingRecord): Promise<void> {
    this.record = record;
  }

  public async clear(): Promise<void> {
    this.record = null;
  }
}

class FakeDriver implements BrowserDriver {
  public navigateCalls = 0;
  public openCalls = 0;
  public failNavigationWithMissingTab = false;
  private readonly tabs: BrowserTab[] = [
    { id: 1, title: "First", url: "https://example.test/", active: true },
    { id: 2, title: "Second", url: "https://other.test/", active: false }
  ];

  public async listTabs(): Promise<BrowserTab[]> {
    return this.tabs;
  }

  public async getTab(tabId: number): Promise<BrowserTab> {
    const tab = this.tabs.find((item) => item.id === tabId);
    if (tab === undefined) throw new SessionOperationError("TAB_NOT_FOUND");
    return tab;
  }

  public async openTab(url: string): Promise<BrowserTab> {
    this.openCalls += 1;
    return { id: 3, title: "New", url, active: true };
  }

  public async navigateTab(tabId: number, url: string): Promise<BrowserTab> {
    this.navigateCalls += 1;
    if (this.failNavigationWithMissingTab) throw new SessionOperationError("TAB_NOT_FOUND");
    const tab = await this.getTab(tabId);
    return { ...tab, url };
  }
}

class RecordingTransport {
  public readonly commands: BrowserCommand[] = [];

  public constructor(private readonly responses: BrowserCommandResult[]) {}

  public async dispatchCommand(command: BrowserCommand): Promise<BrowserCommandResult> {
    this.commands.push(command);
    const response = this.responses.shift();
    if (response === undefined) throw new Error("Unexpected driver command");
    return response;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof SessionOperationError && error.code === code;
}
