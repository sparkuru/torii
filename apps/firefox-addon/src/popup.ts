const queriedControls = {
  statusElement: document.querySelector<HTMLParagraphElement>("#status"),
  codeElement: document.querySelector<HTMLInputElement>("#pairing-code"),
  portElement: document.querySelector<HTMLInputElement>("#port"),
  pairButton: document.querySelector<HTMLButtonElement>("#pair"),
  revokeButton: document.querySelector<HTMLButtonElement>("#revoke")
};

if (Object.values(queriedControls).some((control) => control === null)) {
  throw new Error("Popup is missing required controls");
}

const { statusElement, codeElement, portElement, pairButton, revokeButton } = queriedControls as {
  statusElement: HTMLParagraphElement;
  codeElement: HTMLInputElement;
  portElement: HTMLInputElement;
  pairButton: HTMLButtonElement;
  revokeButton: HTMLButtonElement;
};

type PopupState = { status: "unpaired" | "connecting" | "paired" | "disconnected"; port: number; error?: string };

pairButton.addEventListener("click", () => void pair());
revokeButton.addEventListener("click", () => void revoke());
void refresh();

async function refresh(): Promise<void> {
  applyState(await send({ kind: "get-state" }));
}

async function pair(): Promise<void> {
  const port = Number(portElement.value);
  applyState({ status: "connecting", port });
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
    // The popup remains usable even if the background worker restarted.
  }
  return { status: "disconnected", port: Number(portElement.value) || 32145, error: "Addon background is unavailable." };
}

function applyState(state: PopupState): void {
  portElement.value = String(state.port);
  statusElement.textContent = state.error === undefined ? `Status: ${state.status}` : `Status: ${state.status}. ${state.error}`;
  revokeButton.hidden = state.status !== "paired";
  revokeButton.disabled = state.status !== "paired";
  pairButton.disabled = state.status === "connecting";
}

function isPopupState(value: unknown): value is PopupState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    (state.status === "unpaired" || state.status === "connecting" || state.status === "paired" || state.status === "disconnected") &&
    typeof state.port === "number"
  );
}
