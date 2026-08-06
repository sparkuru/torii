import { DEFAULT_BROKER_HOST, DEFAULT_BROKER_PORT, serverMessageSchema, type ServerMessage } from "@torii/contracts";

type AddonStatus = "unpaired" | "connecting" | "paired" | "disconnected";

interface StoredBinding {
  token: string;
  port: number;
}

type PopupRequest =
  | { kind: "get-state" }
  | { kind: "pair"; code: string; port: number }
  | { kind: "revoke" };

interface PopupState {
  status: AddonStatus;
  port: number;
  error?: string;
}

browser.runtime.onMessage.addListener((message: unknown) => handlePopupMessage(message));

async function handlePopupMessage(message: unknown): Promise<PopupState> {
  if (!isPopupRequest(message)) return { status: "disconnected", port: DEFAULT_BROKER_PORT, error: "Invalid popup request" };

  switch (message.kind) {
    case "get-state":
      return authenticateStoredBinding();
    case "pair":
      return pair(message.code, message.port);
    case "revoke":
      return revoke();
  }
}

async function pair(code: string, port: number): Promise<PopupState> {
  if (!isPort(port) || code.length < 16 || code.length > 128) {
    return { status: "unpaired", port, error: "Enter a valid pairing code and port." };
  }
  const response = await request(port, { kind: "pair", code });
  if (response === null) return { status: "disconnected", port, error: "Broker is unavailable." };
  if (response.kind !== "paired") return { status: "unpaired", port, error: displayError(response) };
  await browser.storage.local.set({ binding: { token: response.token, port } satisfies StoredBinding });
  return { status: "paired", port };
}

async function authenticateStoredBinding(): Promise<PopupState> {
  const binding = await loadBinding();
  if (binding === null) return { status: "unpaired", port: DEFAULT_BROKER_PORT };
  const response = await request(binding.port, { kind: "authenticate", token: binding.token });
  if (response === null) return { status: "disconnected", port: binding.port, error: "Broker is unavailable." };
  if (response.kind === "authenticated") return { status: "paired", port: binding.port };
  await clearBinding();
  return { status: "unpaired", port: binding.port, error: displayError(response) };
}

async function revoke(): Promise<PopupState> {
  const binding = await loadBinding();
  if (binding === null) return { status: "unpaired", port: DEFAULT_BROKER_PORT };
  const response = await request(binding.port, { kind: "revoke", token: binding.token });
  await clearBinding();
  if (response === null) return { status: "unpaired", port: binding.port, error: "Local binding removed; broker was unavailable." };
  if (response.kind === "revoked") return { status: "unpaired", port: binding.port };
  return { status: "unpaired", port: binding.port, error: displayError(response) };
}

async function request(port: number, payload: Record<string, string>): Promise<ServerMessage | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: ServerMessage | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const socket = new WebSocket(`ws://${DEFAULT_BROKER_HOST}:${port}`);
    const timeout = setTimeout(() => {
      socket.close();
      settle(null);
    }, 5_000);
    socket.addEventListener("open", () => socket.send(JSON.stringify(payload)), { once: true });
    socket.addEventListener(
      "message",
      (event) => {
        socket.close();
        if (typeof event.data !== "string") return settle(null);
        const result = serverMessageSchema.safeParse(safeJsonParse(event.data));
        settle(result.success ? result.data : null);
      },
      { once: true }
    );
    socket.addEventListener(
      "error",
      () => {
        socket.close();
        settle(null);
      },
      { once: true }
    );
    socket.addEventListener("close", () => settle(null), { once: true });
  });
}

async function loadBinding(): Promise<StoredBinding | null> {
  const stored = await browser.storage.local.get("binding");
  const binding = stored.binding;
  if (!isStoredBinding(binding)) return null;
  return binding;
}

async function clearBinding(): Promise<void> {
  await browser.storage.local.remove("binding");
}

function isPopupRequest(value: unknown): value is PopupRequest {
  if (typeof value !== "object" || value === null || !("kind" in value)) return false;
  const request = value as Record<string, unknown>;
  if (request.kind === "get-state" || request.kind === "revoke") return true;
  return request.kind === "pair" && typeof request.code === "string" && isPort(request.port);
}

function isStoredBinding(value: unknown): value is StoredBinding {
  if (typeof value !== "object" || value === null) return false;
  const binding = value as Record<string, unknown>;
  return typeof binding.token === "string" && binding.token.length >= 32 && isPort(binding.port);
}

function isPort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65_535;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function displayError(response: ServerMessage): string {
  return response.kind === "error" ? `Pairing failed: ${response.code}` : "Unexpected broker response.";
}
