import { chmod, mkdir } from "node:fs/promises";
import envPaths from "env-paths";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  DEFAULT_BROKER_PORT,
  claimTabInputSchema,
  endSessionInputSchema,
  isCrossOrigin,
  isNavigationUrl,
  listTabsInputSchema,
  navigateTabInputSchema,
  openTabInputSchema,
  startSessionInputSchema,
} from "@torii/contracts";
import {
  FileBindingRepository,
  PairingManager,
  SessionOperationError,
  SessionManager,
  defaultStateFile,
  isSessionOperationError,
  type PairingCode
} from "@torii/session";
import { PairingBroker } from "./broker.js";
import { WebExtensionDriver } from "./driver-webext.js";

export interface ToriiRuntime {
  readonly broker: PairingBroker;
  readonly pairingCode: PairingCode;
  readonly sessionManager: SessionManager;
  close(): Promise<void>;
}

export interface StartToriiOptions {
  readonly stateDirectory?: string;
  readonly port?: number;
  readonly connectStdio?: boolean;
}

export function parseBrokerPort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_BROKER_PORT;
  if (!/^\d+$/.test(value)) throw new Error("TORII_BROKER_PORT must be an integer between 1 and 65535");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TORII_BROKER_PORT must be an integer between 1 and 65535");
  }
  return port;
}

export async function startTorii(options: StartToriiOptions = {}): Promise<ToriiRuntime> {
  const stateDirectory = options.stateDirectory ?? defaultDataDirectory();
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await chmod(stateDirectory, 0o700);
  const pairingManager = new PairingManager(new FileBindingRepository(defaultStateFile(stateDirectory)));
  await pairingManager.initialize();

  let sessionManager: SessionManager | null = null;
  const broker = new PairingBroker({
    pairingManager,
    port: options.port ?? DEFAULT_BROKER_PORT,
    onTabRemoved: (tabId) => sessionManager?.tabRemoved(tabId),
    onAuthenticatedTransportLost: () => sessionManager?.endForTransportLoss()
  });
  sessionManager = new SessionManager(new WebExtensionDriver(broker));
  sessionManager.subscribe((state) => broker.publishSessionState(state));
  await broker.start();
  const pairingCode = pairingManager.openPairing();

  let mcpServer: Server | null = null;
  if (options.connectStdio ?? true) {
    mcpServer = createMcpServer(sessionManager);
    await mcpServer.connect(new StdioServerTransport());
  }

  return {
    broker,
    pairingCode,
    sessionManager,
    async close(): Promise<void> {
      await mcpServer?.close();
      await broker.close();
    }
  };
}

function createMcpServer(sessionManager: SessionManager): Server {
  const server = new Server(
    { name: "torii", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: foundationTools }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await executeTool(sessionManager, request.params.name, request.params.arguments);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error: unknown) {
      const code = isSessionOperationError(error) ? error.code : "INTERNAL_ERROR";
      return { content: [{ type: "text", text: JSON.stringify({ error: code }) }], isError: true };
    }
  });
  return server;
}

async function executeTool(sessionManager: SessionManager, name: string, input: unknown): Promise<unknown> {
  switch (name) {
    case "browser_start_session": {
      const args = parseInput(startSessionInputSchema, input);
      const result = sessionManager.start(args.intent);
      return { session_id: result.sessionId, status: result.status };
    }
    case "browser_end_session": {
      const args = parseInput(endSessionInputSchema, input);
      return sessionManager.end(args.session_id);
    }
    case "browser_list_tabs": {
      const args = parseInput(listTabsInputSchema, input);
      return { tabs: await sessionManager.listTabs(args.session_id) };
    }
    case "browser_claim_tab": {
      const args = parseInput(claimTabInputSchema, input);
      return { tab: await sessionManager.claimTab(args.session_id, args.tab_id) };
    }
    case "browser_open": {
      const args = parseNavigationInput(openTabInputSchema, input);
      return { tab: await sessionManager.openTab(args.session_id, args.url), risk: { new_tab: true } };
    }
    case "browser_navigate": {
      const args = parseNavigationInput(navigateTabInputSchema, input);
      const previous = sessionManager.claimedTab(args.session_id);
      const tab = await sessionManager.navigateTab(args.session_id, args.tab_id, args.url);
      return { tab, risk: { cross_origin: isCrossOrigin(previous.url, args.url) } };
    }
    default:
      throw new SessionOperationError("UNKNOWN_MESSAGE");
  }
}

function parseInput<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SessionOperationError("MALFORMED_MESSAGE");
  return result.data;
}

function parseNavigationInput<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  if (typeof value === "object" && value !== null && "url" in value && typeof value.url === "string" && !isNavigationUrl(value.url)) {
    throw new SessionOperationError("INVALID_URL");
  }
  return parseInput(schema, value);
}

const foundationTools = [
  tool("browser_start_session", "Start the one active local browser session.", { intent: stringField(1, 1_000) }, ["intent"]),
  tool("browser_end_session", "End the active session and release its claimed tab.", { session_id: stringField("uuid") }, ["session_id"]),
  tool("browser_list_tabs", "List visible Firefox tabs for the active session.", { session_id: stringField("uuid") }, ["session_id"]),
  tool(
    "browser_claim_tab",
    "Claim exactly one listed tab for the active session.",
    { session_id: stringField("uuid"), tab_id: { type: "integer", minimum: 0 } },
    ["session_id", "tab_id"]
  ),
  tool(
    "browser_open",
    "Open an http or https URL in a new tab and replace the session claim.",
    { session_id: stringField("uuid"), url: stringField(1, 2_048) },
    ["session_id", "url"]
  ),
  tool(
    "browser_navigate",
    "Navigate the claimed tab to an http or https URL.",
    { session_id: stringField("uuid"), tab_id: { type: "integer", minimum: 0 }, url: stringField(1, 2_048) },
    ["session_id", "tab_id", "url"]
  )
];

function tool(name: string, description: string, properties: Record<string, object>, required: string[]) {
  return { name, description, inputSchema: { type: "object", properties, required, additionalProperties: false } };
}

function stringField(minLength: number | "uuid", maxLength?: number): object {
  return minLength === "uuid" ? { type: "string", format: "uuid" } : { type: "string", minLength, maxLength };
}

function defaultDataDirectory(): string {
  const configured = process.env.TORII_STATE_DIR;
  return configured === undefined || configured === "" ? envPaths("torii").data : configured;
}
