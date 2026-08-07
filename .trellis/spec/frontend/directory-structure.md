# Firefox Addon Directory Structure

## Current Phase 0 layout

The frontend is a Firefox WebExtension popup/background pair, not a React or
browser-hosted SPA:

```text
apps/firefox-addon/
  manifest.json          # MV3 permission and entry-point declaration
  popup.html             # native semantic popup markup
  popup.css              # popup-local CSS
  src/background.ts      # broker connection, binding storage, popup messages
  src/popup.ts           # DOM lookup, events, rendering of PopupState
  src/firefox.d.ts       # minimal typed browser API surface
scripts/build-addon.mjs  # copies static files and bundles TS to dist/
```

`manifest.json` declares the background script and `popup.html`; the build
script copies the static files and bundles `background.ts` and `popup.ts` into
`apps/firefox-addon/dist/`.

## Module boundary

- Keep broker WebSocket calls and `browser.storage.local` mutations in
  `src/background.ts`.
- Keep popup DOM event wiring and state rendering in `src/popup.ts`; it sends
  messages to the background rather than opening its own socket.
- Place only the smallest needed Firefox API declarations in `src/firefox.d.ts`
  until a real typed browser API dependency is adopted.
- Keep shared broker constants and validated protocol messages in
  `@torii/contracts`, never duplicated in addon files.

## Do not introduce

- `components/`, React hooks, router, global store, or SPA build conventions:
  none exists for this native popup.
- Browser control permissions or content scripts that are not present in the
  manifest. Phase 0 only has `storage` and loopback WebSocket host access.

## Evidence example

The popup delegates all browser state to the background:

```ts
const response = await browser.runtime.sendMessage(message);
```

Source: `apps/firefox-addon/src/popup.ts`.
