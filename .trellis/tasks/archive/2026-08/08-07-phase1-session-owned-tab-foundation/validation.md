# Phase 1 validation record

## Automated checks

- `npm run typecheck` — passed.
- `npm test` — passed (20 tests). The sandbox blocks `tsx`'s local IPC pipe, so
  the complete suite was run with normal local IPC permission after the
  Inspector released the fixed production broker port `127.0.0.1:32145`.
- Reconnect-grace regressions — passed with the focused Node test command:
  same-binding recovery retains the session, failed authentication clears it,
  invalid authentication does not disrupt a separate live binding, dispatch is
  unavailable during the gap, pairing replacement/revocation/shutdown clear it,
  and the fixed ten-second deadline clears it.
- Worker-wakeup manifest regression — passed: the only added permission is
  `alarms`; loopback-only host access and every prohibited browser privilege
  remain absent.
- `npm run build` — passed.
- `git diff --check` — passed.
- Generated manifest inspection — passed: permissions are exactly `storage`,
  `tabs`, and `alarms`; host permissions remain `ws://127.0.0.1/*` and no prohibited
  privilege is present.
- `npm run addon:smoke` — passed with normal local loopback/GUI permission:
  `web-ext` installed `apps/firefox-addon/dist` as a temporary addon. Repeated
  after the connection/navigation regression change.

## Firefox evidence boundary

Playwright is not effective: this project has no Playwright dependency,
extension-runtime harness, browser fixture, or HTTP application to target.
`npm run addon:smoke` is the available interactive Firefox loading check and
requires Firefox plus a usable graphical display.

Manual procedure: start the broker, launch `npm run addon:smoke`, pair in the
popup, then close the popup and verify the background still accepts an MCP
session/list/claim command. Reload the addon/background and verify it restores
the stored binding without opening the popup. Confirm the named six-second
reconnect alarm wakes a released worker and restores only the stored binding.
Disconnect the authenticated
addon socket, restore the same stored binding within ten seconds, and verify
the active session remains usable only after reauthentication; wait more than
ten seconds in a separate run and verify the session is ended. Open an `https`
tab and navigate
that claimed tab to a distinct page; verify each returned tab URL and title is
the post-navigation state, not the previous page, and that a stalled load
returns `DRIVER_TIMEOUT` after five seconds. Close the tab, verify later
navigation is rejected as `TAB_NOT_CLAIMED`, end the session, and revoke the
binding. Inspect the generated manifest for `storage`, `tabs`, and `alarms` only, no
`activeTab`, `scripting`, broad web host permissions, or privileged browser
permissions.

## Accepted manual evidence

- Inspector export `inspector-protocol-npm-2026-08-07T07-14-50.139Z.json`:
  paired Firefox started a session, listed and claimed tabs, opened a new
  HTTPS tab, navigated claimed tabs across origins with settled metadata, and
  ended the session. A later call returned `SESSION_NOT_ACTIVE` as required.
- The user confirmed the MV3 alarm-backed recovery path worked with the popup
  closed, then revoked the temporary binding and stopped the Inspector.
