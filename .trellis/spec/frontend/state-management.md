# Firefox Addon State Management

## Current model

There is no client state library, global store, server-state cache, or URL
state. Phase 0 divides state by browser lifetime:

| State | Owner | Current representation |
| --- | --- | --- |
| Rendered popup status and control state | popup page | `PopupState` passed to `applyState` |
| Pairing token and configured broker port | addon background / extension profile | `browser.storage.local` key `binding` |
| Broker pairing/binding authority | local server | `PairingManager` plus hash-only file record |

The popup asks the background for state on startup (`get-state`) and after each
action. The background authenticates the stored binding and clears it if the
broker rejects it.

```ts
const binding = await loadBinding();
if (binding === null) return { status: "unpaired", port: DEFAULT_BROKER_PORT };
const response = await request(binding.port, { kind: "authenticate", token: binding.token });
```

Source: `apps/firefox-addon/src/background.ts`.

## Rules

- Persist only the addon-side binding `{ token, port }` in extension local
  storage; keep it out of popup DOM state and logs.
- Read, validate, and clear stored binding only in the background.
- On revoke, clear local storage even when the broker is unavailable. This is
  intentional fail-safe behavior in `background.ts`.
- Render status from returned state; do not infer paired state solely from a
  token being present in the popup.

## Do not introduce

- Redux/Zustand/React context/query caches without a separately justified UI
  architecture.
- A hostname preference: the addon builds URLs from the shared fixed
  `DEFAULT_BROKER_HOST` and a validated port.
