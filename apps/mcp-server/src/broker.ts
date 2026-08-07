import { randomUUID } from "node:crypto";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  DEFAULT_BROKER_HOST,
  DEFAULT_BROKER_PORT,
  MAX_MESSAGE_BYTES,
  clientMessageSchema,
  errorMessage,
  type BrowserCommand,
  type BrowserCommandResult,
  type ClientMessage,
  type ServerMessage,
  type SessionState
} from "@torii/contracts";
import { PairingManager } from "@torii/session";

const AUTHENTICATED_RECONNECT_GRACE_MS = 10_000;

export interface BrokerOptions {
  readonly pairingManager: PairingManager;
  readonly port?: number;
  readonly host?: typeof DEFAULT_BROKER_HOST;
  readonly onTabRemoved?: (tabId: number) => void;
  readonly onAuthenticatedTransportLost?: () => void;
}

interface PendingCommand {
  socket: WebSocket;
  resolve(result: BrowserCommandResult): void;
  timeout: NodeJS.Timeout;
}

export class PairingBroker {
  private readonly host: typeof DEFAULT_BROKER_HOST;
  private readonly port: number;
  private server: WebSocketServer | null = null;
  private readonly authenticatedConnections = new Map<WebSocket, string>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private sessionState: SessionState = { status: "idle" };
  private reconnectGraceToken: string | null = null;
  private reconnectGraceTimeout: NodeJS.Timeout | null = null;

  public constructor(private readonly options: BrokerOptions) {
    this.host = options.host ?? DEFAULT_BROKER_HOST;
    this.port = options.port ?? DEFAULT_BROKER_PORT;
    if (this.host !== DEFAULT_BROKER_HOST) throw new Error("Broker host must be 127.0.0.1");
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
    this.endSessionForTrustBoundary();
    for (const [requestId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.resolve({ kind: "error", code: "DRIVER_UNAVAILABLE" });
      this.pendingCommands.delete(requestId);
    }
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

  public publishSessionState(state: SessionState): void {
    this.sessionState = state;
    this.broadcast({ kind: "session-state", state });
  }

  public dispatchCommand(command: BrowserCommand): Promise<BrowserCommandResult> {
    const socket = this.activeAddonSocket();
    if (socket === null) return Promise.resolve({ kind: "error", code: "DRIVER_UNAVAILABLE" });

    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        resolve({ kind: "error", code: "DRIVER_TIMEOUT" });
      }, 5_000);
      this.pendingCommands.set(requestId, { socket, resolve, timeout });
      this.send(socket, { kind: "command", requestId, command });
    });
  }

  private attachConnection(socket: WebSocket): void {
    socket.on("message", (rawData) => {
      void this.handleMessage(socket, rawData).catch(() => this.send(socket, errorMessage("INTERNAL_ERROR")));
    });
    socket.on("close", () => this.detachConnection(socket));
    socket.on("error", () => this.detachConnection(socket));
  }

  private detachConnection(socket: WebSocket): void {
    const token = this.authenticatedConnections.get(socket);
    const wasAuthenticated = this.authenticatedConnections.delete(socket);
    for (const [requestId, pending] of this.pendingCommands) {
      if (pending.socket !== socket) continue;
      clearTimeout(pending.timeout);
      pending.resolve({ kind: "error", code: "DRIVER_UNAVAILABLE" });
      this.pendingCommands.delete(requestId);
    }
    if (wasAuthenticated && token !== undefined && this.authenticatedConnections.size === 0) this.startReconnectGrace(token);
  }

  private async handleMessage(socket: WebSocket, rawData: RawData): Promise<void> {
    const parsed = parseClientMessage(rawData);
    if (parsed === null) return this.send(socket, errorMessage("MALFORMED_MESSAGE"));

    switch (parsed.kind) {
      case "pair": {
        const result = await this.options.pairingManager.pair(parsed.code);
        if (!result.ok) return this.send(socket, errorMessage(result.code));
        if (this.authenticatedConnections.size > 0 || this.reconnectGraceToken !== null) {
          this.endSessionForTrustBoundary();
          this.closeAuthenticatedConnectionsExcept(socket);
        }
        this.authenticatedConnections.set(socket, result.token);
        this.send(socket, { kind: "paired", token: result.token });
        return this.send(socket, { kind: "session-state", state: this.sessionState });
      }
      case "authenticate": {
        if (!this.options.pairingManager.isAuthenticated(parsed.token)) {
          if (this.reconnectGraceToken !== null) this.endSessionForTrustBoundary();
          return this.send(socket, errorMessage("BINDING_REVOKED"));
        }
        if (this.reconnectGraceToken !== null && this.reconnectGraceToken !== parsed.token) {
          this.endSessionForTrustBoundary();
        } else {
          this.cancelReconnectGrace(parsed.token);
        }
        this.authenticatedConnections.set(socket, parsed.token);
        this.send(socket, { kind: "authenticated" });
        return this.send(socket, { kind: "session-state", state: this.sessionState });
      }
      case "revoke": {
        if (!(await this.options.pairingManager.revoke(parsed.token))) {
          return this.send(socket, errorMessage("NOT_PAIRED"));
        }
        this.endSessionForTrustBoundary();
        this.send(socket, { kind: "revoked" });
        this.closeConnectionsForToken(parsed.token);
        return;
      }
      case "command-result": {
        if (!this.isSocketAuthenticated(socket)) return this.send(socket, errorMessage("NOT_PAIRED"));
        const pending = this.pendingCommands.get(parsed.requestId);
        if (pending === undefined || pending.socket !== socket) return;
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(parsed.requestId);
        pending.resolve(parsed.result);
        return;
      }
      case "tab-removed":
        if (!this.isSocketAuthenticated(socket)) return this.send(socket, errorMessage("NOT_PAIRED"));
        this.options.onTabRemoved?.(parsed.tabId);
        return;
    }
  }

  private activeAddonSocket(): WebSocket | null {
    for (const socket of this.authenticatedConnections.keys()) {
      if (socket.readyState === socket.OPEN && this.isSocketAuthenticated(socket)) return socket;
    }
    return null;
  }

  private closeConnectionsForToken(token: string): void {
    for (const [socket, authenticatedToken] of this.authenticatedConnections) {
      if (authenticatedToken === token) {
        this.authenticatedConnections.delete(socket);
        socket.close(1008, "binding revoked");
      }
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const socket of this.authenticatedConnections.keys()) {
      if (this.isSocketAuthenticated(socket)) this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  private isSocketAuthenticated(socket: WebSocket): boolean {
    const token = this.authenticatedConnections.get(socket);
    return token !== undefined && this.options.pairingManager.isAuthenticated(token);
  }

  private startReconnectGrace(token: string): void {
    this.cancelReconnectGrace();
    this.reconnectGraceToken = token;
    this.reconnectGraceTimeout = setTimeout(() => this.endSessionForTrustBoundary(), AUTHENTICATED_RECONNECT_GRACE_MS);
  }

  private cancelReconnectGrace(token?: string): void {
    if (token !== undefined && this.reconnectGraceToken !== token) return;
    if (this.reconnectGraceTimeout !== null) clearTimeout(this.reconnectGraceTimeout);
    this.reconnectGraceTimeout = null;
    this.reconnectGraceToken = null;
  }

  private endSessionForTrustBoundary(): void {
    this.cancelReconnectGrace();
    this.options.onAuthenticatedTransportLost?.();
  }

  private closeAuthenticatedConnectionsExcept(except: WebSocket): void {
    for (const socket of this.authenticatedConnections.keys()) {
      if (socket === except) continue;
      this.authenticatedConnections.delete(socket);
      socket.close(1008, "binding replaced");
    }
  }
}

function parseClientMessage(rawData: RawData): ClientMessage | null {
  const data = Array.isArray(rawData) ? Buffer.concat(rawData) : Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);
  if (data.byteLength > MAX_MESSAGE_BYTES) return null;
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(data.toString("utf8")));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
