import {
  DEFAULT_BROKER_HOST,
  DEFAULT_BROKER_PORT,
  browserCommandResultSchema,
  isNavigationUrl,
  serverMessageSchema,
  type BrowserCommand,
  type BrowserCommandResult,
  type BrowserTab,
  type ServerMessage,
  type SessionState
} from "@torii/contracts";

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
  session: SessionState;
  error?: string;
}

let commandSocket: WebSocket | null = null;
let status: AddonStatus = "unpaired";
let brokerPort = DEFAULT_BROKER_PORT;
let session: SessionState = { status: "idle" };
let connectionError: string | undefined;
let controlResponse: ((response: ServerMessage) => void) | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const intentionallyClosedSockets = new WeakSet<WebSocket>();
const NAVIGATION_SETTLE_TIMEOUT_MS = 5_000;
const RECONNECT_ALARM_NAME = "torii-reconnect";
const RECONNECT_ALARM_PERIOD_MINUTES = 0.1;
let recoveryInFlight: Promise<void> | null = null;

browser.runtime.onMessage.addListener((message: unknown) => handlePopupMessage(message));
browser.tabs.onRemoved.addListener((tabId) => {
  sendToBroker({ kind: "tab-removed", tabId });
});
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM_NAME) void resumeAuthenticatedConnection();
});
scheduleReconnect(0);

async function handlePopupMessage(message: unknown): Promise<PopupState> {
  if (!isPopupRequest(message)) return popupState("Invalid popup request");

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
    return popupState("Enter a valid pairing code and port.", "unpaired", port);
  }
  if (recoveryInFlight !== null) await recoveryInFlight;
  cancelReconnect();
  closeSocket();
  status = "connecting";
  brokerPort = port;
  const response = await connect(port, { kind: "pair", code });
  if (response === null) {
    closeSocket();
    return popupState("Broker is unavailable.", "disconnected", port);
  }
  if (response.kind !== "paired") {
    closeSocket();
    return popupState(displayError(response), "unpaired", port);
  }
  await browser.storage.local.set({ binding: { token: response.token, port } satisfies StoredBinding });
  await ensureReconnectAlarm();
  status = "paired";
  connectionError = undefined;
  return popupState();
}

async function authenticateStoredBinding(): Promise<PopupState> {
  await resumeAuthenticatedConnection();
  const binding = await loadBinding();
  if (binding === null) {
    await clearReconnectAlarm();
    return popupState(undefined, "unpaired", DEFAULT_BROKER_PORT);
  }
  await ensureReconnectAlarm();
  brokerPort = binding.port;
  return popupState();
}

async function revoke(): Promise<PopupState> {
  const binding = await loadBinding();
  if (binding === null) {
    await clearReconnectAlarm();
    return popupState(undefined, "unpaired", DEFAULT_BROKER_PORT);
  }
  const connected = await authenticateStoredBinding();
  if (connected.status !== "paired") {
    await clearBinding();
    closeSocket();
    return popupState("Local binding removed; broker was unavailable.", "unpaired", binding.port);
  }
  const response = await sendControl({ kind: "revoke", token: binding.token });
  await clearBinding();
  closeSocket();
  session = { status: "idle" };
  if (response === null) return popupState("Local binding removed; broker was unavailable.", "unpaired", binding.port);
  return response.kind === "revoked"
    ? popupState(undefined, "unpaired", binding.port)
    : popupState(displayError(response), "unpaired", binding.port);
}

async function connect(port: number, initialMessage: Record<string, string>): Promise<ServerMessage | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (response: ServerMessage | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(response);
    };
    const socket = new WebSocket(`ws://${DEFAULT_BROKER_HOST}:${port}`);
    let authenticated = false;
    commandSocket = socket;
    const timeout = setTimeout(() => {
      socket.close();
      settle(null);
    }, 5_000);
    socket.addEventListener("open", () => socket.send(JSON.stringify(initialMessage)), { once: true });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const parsed = serverMessageSchema.safeParse(safeJsonParse(event.data));
      if (!parsed.success) return;
      handleServerMessage(parsed.data);
      if (parsed.data.kind === "paired" || parsed.data.kind === "authenticated") authenticated = true;
      if (parsed.data.kind === "paired" || parsed.data.kind === "authenticated" || parsed.data.kind === "error") {
        settle(parsed.data);
      }
    });
    socket.addEventListener("error", () => settle(null), { once: true });
    socket.addEventListener("close", () => {
      if (commandSocket === socket) {
        commandSocket = null;
        session = { status: "idle" };
        if (status === "paired" || status === "connecting") status = "disconnected";
      }
      if (authenticated && !intentionallyClosedSockets.has(socket)) scheduleReconnect();
      settle(null);
    });
  });
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.kind) {
    case "command":
      void executeCommand(message.command).then((result) => sendToBroker({ kind: "command-result", requestId: message.requestId, result }));
      return;
    case "session-state":
      session = message.state;
      return;
    case "paired":
    case "authenticated":
    case "revoked":
    case "error":
      if (controlResponse !== null) {
        const resolve = controlResponse;
        controlResponse = null;
        resolve(message);
      }
      return;
  }
}

function sendControl(message: Record<string, string>): Promise<ServerMessage | null> {
  if (commandSocket?.readyState !== WebSocket.OPEN || controlResponse !== null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      controlResponse = null;
      resolve(null);
    }, 5_000);
    controlResponse = (response) => {
      clearTimeout(timeout);
      resolve(response);
    };
    commandSocket?.send(JSON.stringify(message));
  });
}

async function executeCommand(command: BrowserCommand): Promise<BrowserCommandResult> {
  try {
    switch (command.kind) {
      case "list-tabs":
        return { kind: "tabs", tabs: (await browser.tabs.query({})).map(toBrowserTab).filter(isBrowserTab) };
      case "get-tab":
        return { kind: "tab", tab: toBrowserTab(await browser.tabs.get(command.tabId)) };
      case "open-tab":
        if (!isNavigationUrl(command.url)) return { kind: "error", code: "INVALID_URL" };
        return { kind: "tab", tab: await createAndReadTab(command.url) };
      case "navigate-tab":
        if (!isNavigationUrl(command.url)) return { kind: "error", code: "INVALID_URL" };
        try {
          await browser.tabs.get(command.tabId);
        } catch {
          return { kind: "error", code: "TAB_NOT_FOUND" };
        }
        const navigation = beginNavigationWait(command.tabId, command.url, false, false);
        try {
          await browser.tabs.update(command.tabId, { url: command.url });
        } catch (error: unknown) {
          navigation.cancel();
          try {
            await browser.tabs.get(command.tabId);
          } catch {
            return { kind: "error", code: "TAB_NOT_FOUND" };
          }
          throw error;
        }
        return { kind: "tab", tab: await navigation.result };
    }
  } catch (error: unknown) {
    if (error instanceof NavigationTimeoutError) return { kind: "error", code: "DRIVER_TIMEOUT" };
    if (error instanceof TabNotFoundError) return { kind: "error", code: "TAB_NOT_FOUND" };
    return {
      kind: "error",
      code: command.kind === "get-tab" ? "TAB_NOT_FOUND" : command.kind === "navigate-tab" ? "NAVIGATION_FAILED" : "DRIVER_UNAVAILABLE"
    };
  }
}

async function createAndReadTab(url: string): Promise<BrowserTab> {
  const created = await browser.tabs.create({ url });
  if (created.id === undefined) throw new Error("Firefox did not return a tab id");
  return beginNavigationWait(created.id, url, true, true).result;
}

interface NavigationWait {
  readonly result: Promise<BrowserTab>;
  cancel(): void;
}

function beginNavigationWait(
  tabId: number,
  requestedUrl: string,
  navigationStarted: boolean,
  checkCurrentTab: boolean
): NavigationWait {
  let cleanUp: () => void = () => {};
  const result = new Promise<BrowserTab>((resolve, reject) => {
    let sawNavigation = false;
    const timeout = setTimeout(() => {
      cleanUp();
      reject(new NavigationTimeoutError());
    }, NAVIGATION_SETTLE_TIMEOUT_MS);
    const onUpdated = (updatedTabId: number, changeInfo: { status?: string; url?: string }, tab: { id?: number; title?: string; url?: string; active?: boolean; status?: string }): void => {
      if (updatedTabId !== tabId) return;
      if (changeInfo.url !== undefined || tab.url === requestedUrl) sawNavigation = true;
      if (sawNavigation && changeInfo.status === "complete") {
        cleanUp();
        resolve(toBrowserTab(tab));
      }
    };
    const cleanUp = (): void => {
      clearTimeout(timeout);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };

    browser.tabs.onUpdated.addListener(onUpdated);
    if (navigationStarted) sawNavigation = true;
    if (checkCurrentTab) {
      void browser.tabs.get(tabId).then(
        (tab) => {
          if (tab.url === requestedUrl) sawNavigation = true;
          if (sawNavigation && tab.status === "complete") {
            cleanUp();
            resolve(toBrowserTab(tab));
          }
        },
        (error: unknown) => {
          cleanUp();
          reject(new TabNotFoundError(error));
        }
      );
    }
  });
  return { result, cancel: cleanUp };
}

class NavigationTimeoutError extends Error {
  public constructor() {
    super("Navigation did not settle before the deadline");
  }
}

class TabNotFoundError extends Error {
  public constructor(cause: unknown) {
    super("Firefox could no longer find the tab", { cause });
  }
}

function toBrowserTab(tab: { id?: number; title?: string; url?: string; active?: boolean }): BrowserTab {
  if (tab.id === undefined) throw new Error("Firefox did not return a tab id");
  return { id: tab.id, title: tab.title ?? "", url: tab.url ?? "", active: tab.active ?? false };
}

function isBrowserTab(value: BrowserTab): boolean {
  return browserCommandResultSchema.safeParse({ kind: "tab", tab: value }).success;
}

function sendToBroker(message: object): void {
  if (commandSocket?.readyState === WebSocket.OPEN) commandSocket.send(JSON.stringify(message));
}

function closeSocket(): void {
  if (commandSocket !== null) {
    intentionallyClosedSockets.add(commandSocket);
    commandSocket.close();
  }
  commandSocket = null;
  session = { status: "idle" };
}

function scheduleReconnect(delayMs = 1_000): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void resumeAuthenticatedConnection();
  }, delayMs);
}

function cancelReconnect(): void {
  if (reconnectTimer === null) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function resumeAuthenticatedConnection(): Promise<void> {
  if (recoveryInFlight !== null) return recoveryInFlight;
  recoveryInFlight = recoverStoredBinding().finally(() => {
    recoveryInFlight = null;
  });
  return recoveryInFlight;
}

async function recoverStoredBinding(): Promise<void> {
  if (commandSocket?.readyState === WebSocket.OPEN || commandSocket?.readyState === WebSocket.CONNECTING) return;
  const binding = await loadBinding();
  if (binding === null) {
    await clearReconnectAlarm();
    return;
  }
  await ensureReconnectAlarm();

  brokerPort = binding.port;
  status = "connecting";
  const response = await connect(binding.port, { kind: "authenticate", token: binding.token });
  if (response?.kind === "authenticated") {
    status = "paired";
    connectionError = undefined;
    cancelReconnect();
    return;
  }
  if (response?.kind === "error") {
    connectionError = displayError(response);
    await clearBinding();
  } else {
    connectionError = "Broker is unavailable.";
  }
  closeSocket();
  status = response === null ? "disconnected" : "unpaired";
  if (response === null) scheduleReconnect();
}

function popupState(error = connectionError, overrideStatus = status, overridePort = brokerPort): PopupState {
  return error === undefined
    ? { status: overrideStatus, port: overridePort, session }
    : { status: overrideStatus, port: overridePort, session, error };
}

async function loadBinding(): Promise<StoredBinding | null> {
  const stored = await browser.storage.local.get("binding");
  const binding = stored.binding;
  if (!isStoredBinding(binding)) {
    await clearBinding();
    return null;
  }
  return binding;
}

async function clearBinding(): Promise<void> {
  try {
    await browser.storage.local.remove("binding");
  } finally {
    await clearReconnectAlarm();
  }
}

async function ensureReconnectAlarm(): Promise<void> {
  await browser.alarms.create(RECONNECT_ALARM_NAME, { periodInMinutes: RECONNECT_ALARM_PERIOD_MINUTES });
}

async function clearReconnectAlarm(): Promise<void> {
  await browser.alarms.clear(RECONNECT_ALARM_NAME);
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
  return response.kind === "error" ? `Broker rejected the request: ${response.code}` : "Unexpected broker response.";
}
