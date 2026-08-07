# Firefox Addon Type Safety

## Baseline

All addon code is strict TypeScript under the root `tsconfig.json`. The addon
uses native DOM generics, local discriminated unions, type guards, and shared
Zod schemas at its external boundaries.

- Import broker constants, `ServerMessage`, and `serverMessageSchema` from
  `@torii/contracts`.
- Define addon-private structures (`StoredBinding`, `PopupRequest`,
  `PopupState`) next to their consumer in `src/background.ts` or `src/popup.ts`.
- Use the minimal declarations in `src/firefox.d.ts` for the browser APIs the
  current addon calls.

## Runtime validation patterns

Runtime messages and storage are `unknown` until narrowed with a guard;
WebSocket responses are schema checked:

```ts
const result = serverMessageSchema.safeParse(safeJsonParse(event.data));
settle(result.success ? result.data : null);
```

Stored extension data similarly passes `isStoredBinding` before it is returned
from `loadBinding`. Popup DOM selectors use generic query types and an explicit
required-control check before use.

## Do not do

- Use `any`, blindly cast `browser.runtime.sendMessage` results, or trust
  `browser.storage.local` values without `isStoredBinding`.
- Duplicate shared WebSocket message unions or constants in addon code.
- Accept a broker hostname from the UI; only a validated integer port is
  mutable in Phase 0.

`apps/firefox-addon/src/background.ts` and `src/popup.ts` are the reference
implementations for these boundaries.
