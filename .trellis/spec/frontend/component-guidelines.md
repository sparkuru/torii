# Firefox Popup UI Guidelines

## Current component model

There is no component framework. Phase 0 uses one native HTML document
(`apps/firefox-addon/popup.html`), a TypeScript DOM controller
(`src/popup.ts`), and popup-local CSS (`popup.css`). Treat the popup document
and its controls as the current UI component boundary.

## Patterns in use

- Use semantic native elements: `main`, heading, explicit `label for`, native
  `input`, `button type="button"`, and `details`/`summary` for advanced
  configuration.
- Keep selectors centralized in `queriedControls`; fail fast if required
  elements are absent, then use the typed controls to wire events.
- Render a validated `PopupState` in one place (`applyState`) so text, button
  visibility, and disabled states change together.
- Place user-visible status in the existing `role="status"` paragraph and
  make transient action state visible by disabling the relevant action.

```ts
statusElement.textContent = state.error === undefined ? `Status: ${state.status}` : `Status: ${state.status}. ${state.error}`;
revokeButton.hidden = state.status !== "paired";
pairButton.disabled = state.status === "connecting";
```

Source: `apps/firefox-addon/src/popup.ts`; associated markup is in
`apps/firefox-addon/popup.html`.

## Styling

Use the popup-local CSS rules already in `popup.css`: grid layout, system
`font: menu`, light/dark `color-scheme`, and no CSS framework. Preserve the
minimum width and full-width form controls unless the UI requirement changes.

## Do not do

- Add framework props, JSX, CSS modules, Tailwind, or design-system claims.
- Manipulate the broker/socket directly from the popup or render unvalidated
  runtime-message payloads.
- Remove labels, native button semantics, or status updates when changing the
  popup flow.
