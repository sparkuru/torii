import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  DEFAULT_BROKER_HOST,
  DEFAULT_BROKER_PORT,
  MAX_MESSAGE_BYTES,
  clientMessageSchema,
  errorMessage,
  type ServerMessage
} from "@torii/contracts";
import { PairingManager } from "@torii/session";

export interface BrokerOptions {
  readonly pairingManager: PairingManager;
  readonly port?: number;
  readonly host?: typeof DEFAULT_BROKER_HOST;
}

export class PairingBroker {
  private readonly host: typeof DEFAULT_BROKER_HOST;
  private readonly port: number;
  private server: WebSocketServer | null = null;
  private readonly authenticatedConnections = new Map<WebSocket, string>();

  public constructor(private readonly options: BrokerOptions) {
    this.host = options.host ?? DEFAULT_BROKER_HOST;
    this.port = options.port ?? DEFAULT_BROKER_PORT;
    if (this.host !== DEFAULT_BROKER_HOST) throw new Error("Broker host must be 127.0.0.1");
    // Port zero is accepted only through the programmatic API so integration
    // tests can ask the OS for an isolated ephemeral port. The CLI never
    // exposes a port option and therefore always uses the fixed production port.
    if (!Number.isInteger(this.port) || this.port < 0 || this.port > 65_535) {
      throw new Error("Broker port must be a valid TCP port");
    }
  }

  public async start(): Promise<void> {
    if (this.server !== null) throw new Error("Broker is already running");
    const server = new WebSocketServer({ host: this.host, port: this.port, maxPayload: MAX_MESSAGE_BYTES });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    }).catch((error: unknown) => {
      server.close();
      this.server = null;
      throw error;
    });

    server.on("connection", (socket) => this.attachConnection(socket));
  }

  public async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.authenticatedConnections.clear();
    if (server === null) return;
    for (const client of server.clients) client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }

  public address(): { host: typeof DEFAULT_BROKER_HOST; port: number } | null {
    if (this.server === null) return null;
    const address = this.server.address();
    if (address === null || typeof address === "string") return null;
    return { host: this.host, port: address.port };
  }

  private attachConnection(socket: WebSocket): void {
    socket.on("message", (rawData) => {
      void this.handleMessage(socket, rawData).catch(() => this.send(socket, errorMessage("INTERNAL_ERROR")));
    });
    socket.on("close", () => this.authenticatedConnections.delete(socket));
    socket.on("error", () => this.authenticatedConnections.delete(socket));
  }

  private async handleMessage(socket: WebSocket, rawData: RawData): Promise<void> {
    const parsed = parseClientMessage(rawData);
    if (parsed === null) return this.send(socket, errorMessage("MALFORMED_MESSAGE"));

    switch (parsed.kind) {
      case "pair": {
        const result = await this.options.pairingManager.pair(parsed.code);
        if (!result.ok) return this.send(socket, errorMessage(result.code));
        this.authenticatedConnections.set(socket, result.token);
        return this.send(socket, { kind: "paired", token: result.token });
      }
      case "authenticate": {
        if (!this.options.pairingManager.isAuthenticated(parsed.token)) {
          return this.send(socket, errorMessage("BINDING_REVOKED"));
        }
        this.authenticatedConnections.set(socket, parsed.token);
        return this.send(socket, { kind: "authenticated" });
      }
      case "revoke": {
        if (!(await this.options.pairingManager.revoke(parsed.token))) {
          return this.send(socket, errorMessage("NOT_PAIRED"));
        }
        this.send(socket, { kind: "revoked" });
        this.closeConnectionsForToken(parsed.token);
        return;
      }
    }
  }

  private closeConnectionsForToken(token: string): void {
    for (const [socket, authenticatedToken] of this.authenticatedConnections) {
      if (authenticatedToken === token) socket.close(1008, "binding revoked");
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }
}

function parseClientMessage(rawData: RawData) {
  const data = Array.isArray(rawData) ? Buffer.concat(rawData) : Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
  if (data.byteLength > MAX_MESSAGE_BYTES) return null;
  try {
    return clientMessageSchema.safeParse(JSON.parse(data.toString("utf8"))).data ?? null;
  } catch {
    return null;
  }
}
