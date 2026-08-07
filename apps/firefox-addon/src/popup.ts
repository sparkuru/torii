const queriedControls = {
  statusElement: document.querySelector<HTMLParagraphElement>("#status"),
  sessionStateElement: document.querySelector<HTMLParagraphElement>("#session-state"),
  claimedTabElement: document.querySelector<HTMLParagraphElement>("#claimed-tab"),
  codeElement: document.querySelector<HTMLInputElement>("#pairing-code"),
  portElement: document.querySelector<HTMLInputElement>("#port"),
  pairButton: document.querySelector<HTMLButtonElement>("#pair"),
  revokeButton: document.querySelector<HTMLButtonElement>("#revoke")
};

if (Object.values(queriedControls).some((control) => control === null)) {
  throw new Error("Popup is missing required controls");
}

const { statusElement, sessionStateElement, claimedTabElement, codeElement, portElement, pairButton, revokeButton } = queriedControls as {
  statusElement: HTMLParagraphElement;
  sessionStateElement: HTMLParagraphElement;
  claimedTabElement: HTMLParagraphElement;
  codeElement: HTMLInputElement;
  portElement: HTMLInputElement;
  pairButton: HTMLButtonElement;
  revokeButton: HTMLButtonElement;
};

type PopupState = {
  status: "unpaired" | "connecting" | "paired" | "disconnected";
  port: number;
  session: { status: "idle" | "active"; claimedTab?: { id: number; title: string; url: string; active: boolean } };
  error?: string;
};

pairButton.addEventListener("click", () => void pair());
revokeButton.addEventListener("click", () => void revoke());
void refresh();

async function refresh(): Promise<void> {
  applyState(await send({ kind: "get-state" }));
}

async function pair(): Promise<void> {
  const port = Number(portElement.value);
  applyState({ status: "connecting", port, session: { status: "idle" } });
  applyState(await send({ kind: "pair", code: codeElement.value.trim(), port }));
}

async function revoke(): Promise<void> {
  revokeButton.disabled = true;
  applyState(await send({ kind: "revoke" }));
}

async function send(message: unknown): Promise<PopupState> {
  try {
    const response = await browser.runtime.sendMessage(message);
    if (isPopupState(response)) return response;
  } catch {
    // The popup remains usable if the background worker restarts.
  }
  return {
    status: "disconnected",
    port: Number(portElement.value) || 32145,
    session: { status: "idle" },
    error: "Addon background is unavailable."
  };
}

function applyState(state: PopupState): void {
  portElement.value = String(state.port);
  statusElement.textContent = state.error === undefined ? `Status: ${state.status}` : `Status: ${state.status}. ${state.error}`;
  sessionStateElement.textContent = state.session.status === "active" ? "Session: active" : "Session: no active session";
  claimedTabElement.textContent =
    state.session.claimedTab === undefined
      ? "Controlled tab: none"
      : `Controlled tab: ${state.session.claimedTab.title || "Untitled tab"} (ID ${state.session.claimedTab.id})`;
  revokeButton.hidden = state.status !== "paired";
  revokeButton.disabled = state.status !== "paired";
  pairButton.disabled = state.status === "connecting";
}

function isPopupState(value: unknown): value is PopupState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  if (
    !(state.status === "unpaired" || state.status === "connecting" || state.status === "paired" || state.status === "disconnected") ||
    typeof state.port !== "number" ||
    typeof state.session !== "object" ||
    state.session === null
  ) {
    return false;
  }
  const session = state.session as Record<string, unknown>;
  return session.status === "idle" || session.status === "active";
}
