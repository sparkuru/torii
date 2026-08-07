# Firefox Addon Quality Guidelines

## Required checks

Run the root validation profile for addon changes:

```sh
npm run typecheck
npm test
npm run build
```

`npm run addon:smoke` loads `apps/firefox-addon/dist` in a temporary Firefox
profile. It is an interactive loading smoke check, not automated popup E2E;
Firefox and a usable graphical environment are required. For pairing,
permission, storage, or revocation changes, manually pair once and revoke once
in that temporary profile when runnable checks do not exercise the behavior.

There is no configured lint command, CI workflow, Playwright setup, or
automated accessibility scanner. Do not claim such checks passed.

## Review checklist

- Keep `manifest.json` permissions and host permissions minimal. Phase 0 has
  only `storage` and `ws://127.0.0.1/*`; do not add broad browser privileges
  or `<all_urls>` without an approved capability change.
- Retain semantic labels, buttons, `role="status"`, and disabled/hidden state
  behavior in `popup.html`/`popup.ts`.
- Confirm popup-to-background messaging validates malformed input and that
  background WebSocket replies use the shared schema.
- Check that browser storage is cleared after a broker rejection and always on
  revoke, including broker-unavailable revocation.
- Rebuild after changes; the smoke command consumes `dist`, not source files.

## Current test evidence and limitation

`tests/phase0.test.ts` covers the server, session, and broker boundaries. It
does not execute the addon popup/background inside Firefox. That gap is covered
only by the manual `addon:smoke` pairing/revocation path until deterministic
addon E2E is added.
