import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { clientMessageSchema, serverMessageSchema, type ClientMessage, type ServerMessage } from "@torii/contracts";
import { FileBindingRepository, PairingManager, defaultStateFile, type BindingRecord, type BindingRepository } from "@torii/session";
import { PairingBroker } from "../apps/mcp-server/src/broker.js";
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
    assert.deepEqual(tools.tools, []);
  } finally {
    await transport.close();
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
