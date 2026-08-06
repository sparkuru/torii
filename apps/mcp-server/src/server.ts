import { chmod, mkdir } from "node:fs/promises";
import envPaths from "env-paths";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_BROKER_PORT } from "@torii/contracts";
import { FileBindingRepository, PairingManager, defaultStateFile, type PairingCode } from "@torii/session";
import { PairingBroker } from "./broker.js";

export interface ToriiRuntime {
  readonly broker: PairingBroker;
  readonly pairingCode: PairingCode;
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
  const broker = new PairingBroker({ pairingManager, port: options.port ?? DEFAULT_BROKER_PORT });
  await broker.start();
  const pairingCode = pairingManager.openPairing();

  let mcpServer: Server | null = null;
  if (options.connectStdio ?? true) {
    mcpServer = new Server(
      { name: "torii", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
    await mcpServer.connect(new StdioServerTransport());
  }

  return {
    broker,
    pairingCode,
    async close(): Promise<void> {
      await mcpServer?.close();
      await broker.close();
    }
  };
}

function defaultDataDirectory(): string {
  const configured = process.env.TORII_STATE_DIR;
  return configured === undefined || configured === "" ? envPaths("torii").data : configured;
}
