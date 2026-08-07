# Hook Guidelines

## Current Phase 0 state

This addon does not use React, a hook library, or custom `use*` functions.
There are therefore no hook naming, dependency-array, data-fetching, or hook
test conventions to follow.

The closest equivalent is explicit async browser-boundary functions:

- `refresh`, `pair`, `revoke`, and `send` in
  `apps/firefox-addon/src/popup.ts` handle popup lifecycle and dispatch.
- `pair`, `authenticateStoredBinding`, `revoke`, and `request` in
  `apps/firefox-addon/src/background.ts` own asynchronous broker and storage
  work.

Each function returns a typed `PopupState` or a narrow protocol result rather
than exposing mutable UI state. For example:

```ts
async function refresh(): Promise<void> {
  applyState(await send({ kind: "get-state" }));
}
```

## Guidance

- Keep native async behavior as named functions close to the browser boundary.
- If adding a framework later, establish its lifecycle and test conventions in
  this document before introducing hooks. Do not retrofit React terms onto the
  current popup.
- Use background runtime messaging for cross-context work; a popup close/reopen
  must not make it the owner of the persistent binding.
