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

For session/tab changes, the current manual Firefox evidence path is: pair,
start a session through MCP, list and claim a tab, open or navigate the claimed
tab, close it to observe claim removal, then revoke. A passing addon load smoke
does not substitute for this runtime path.

For stored-binding recovery changes, also close the popup and reload the addon
background before starting the MCP session: list/claim must work without
opening the popup again. Confirm that open and navigate results show the
settled destination tab metadata rather than `about:blank` or the prior page.

MV3 worker wakeup uses only the named `torii-reconnect` alarm. Create its
periodic alarm only after storing a valid binding, route its top-level handler
through the same serialized stored-binding recovery as popup/startup, and clear
it whenever the binding is absent, rejected, or revoked. It must not make a
socket, a popup, or an untrusted alarm payload authority to recover a session.

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
