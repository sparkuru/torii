# Phase 1 Foundation Design

## Boundary and dependencies

Phase 1 adds only a single active session and one claimed tab. It keeps browser
APIs in the Firefox addon and protocol/memory state outside them:

```text
MCP stdio tool handler
  → SessionManager (lifecycle + exactly-one claim)
  → BrowserDriver interface (typed tab operations)
  → WebExtensionDriver (request/response mapping)
  → PairingBroker authenticated socket
  → addon background → browser.tabs
```

`packages/contracts` owns all shared schemas, message discriminants, stable
error codes, tool inputs, and bounded result types. `packages/session` owns
session IDs, lifecycle, intent summary, and current claim, and imports neither
Firefox APIs nor transport objects. The WebExtension driver depends on a narrow
request transport port rather than importing Firefox APIs. The Broker and addon
are the only layers that own WebSocket and `browser.tabs` details.

## Session and ownership model

- There is at most one in-memory session: `idle → active → ended`.
- `browser_start_session(intent)` creates an opaque session ID and returns
  `active`; starting while active returns a stable state error.
- `browser_end_session(session_id)` verifies ownership, clears the claim, and
  ends the session. A later operation returns `SESSION_NOT_ACTIVE`.
- `browser_claim_tab(session_id, tab_id)` verifies the tab through the driver,
  then stores it as the sole claim.
- `browser_open(session_id, url)` validates an absolute `http`/`https` URL,
  creates a new tab through the driver, and atomically replaces any claim with
  its returned tab. The old tab remains open but is no longer controlled.
- `browser_navigate(session_id, tab_id, url)` verifies the active claim before
  issuing a driver request. A closed/invalid tab clears that claim; it never
  invokes `browser.tabs.update` after a failed ownership check.
- A `tab-removed` event from the addon clears a matching claim. MCP process or
  Broker restart creates no persisted session/claim, so tab IDs are never
  reused across browser/runtime restarts.

## Contracts

New MCP tools use Zod schemas and only restricted outputs:

| Tool | Input | Result |
| --- | --- | --- |
| `browser_start_session` | `intent: string` | opaque `session_id`, `active` |
| `browser_end_session` | `session_id` | `ended` |
| `browser_list_tabs` | `session_id` | bounded tab metadata: ID, title, URL, active |
| `browser_claim_tab` | `session_id`, `tab_id` | sole claimed tab |
| `browser_open` | `session_id`, absolute `http`/`https` URL | new claimed tab and `new_tab` risk flag |
| `browser_navigate` | `session_id`, claimed `tab_id`, absolute `http`/`https` URL | current tab and `cross_origin` risk flag |

The shared command channel carries a generated request ID, one of `list-tabs`,
`get-tab`, `open-tab`, or `navigate-tab`, and a schema-validated result/error.
Only the authenticated addon socket may receive commands or return results.

Stable errors include the existing pairing failures plus `SESSION_NOT_ACTIVE`,
`TAB_NOT_CLAIMED`, `TAB_NOT_FOUND`, `INVALID_URL`, `NAVIGATION_FAILED`, and a
non-secret driver-unavailable/timeout code where transport cannot complete.
Risk flags are metadata, not consent: `new_tab` is true for open; `cross_origin`
compares the previous and destination origins for navigation. No page content,
input value, token, or raw browser exception crosses MCP output or ordinary
logs.

## Firefox boundary and permissions

The manifest adds only `tabs`. Firefox requires it to read title and URL for
all listed tabs; `tabs.query`, `tabs.create`, and `tabs.update` are invoked
only by the background. `activeTab`, `scripting`, content scripts, general web
host permissions, and all previously forbidden privileged permissions remain
absent. The background validates command schemas and URL scheme before calling
`browser.tabs`; it emits `tab-removed` when Firefox closes a tab.

The popup remains a native single-column status surface. It gains labelled,
textual session and controlled-tab state while retaining semantic labels,
status-region feedback, keyboard focus, and a non-color-only indication. No
visual rebrand, new navigation, or popup action belongs to this task. The
task-local UI design research is
`research/popup-design-system.md`; only this minimal status treatment is
approved for implementation.

## Validation and rollback

- Unit-test session transitions, single-claim replacement, stale/foreign tab
  rejection, URL validation, risk flags, and claim invalidation.
- Integration-test authenticated command routing, response correlation, failed
  navigation, and that unclaimed requests never reach the driver.
- Inspect the generated manifest for `tabs` and the continuing absence of
  prohibited permissions.
- Run `npm run typecheck`, `npm test`, and `npm run build`. Classify Playwright
  as not effective because no extension-runtime harness or browser test setup
  exists; record `npm run addon:smoke` plus a manual pair/session/list/claim/
  open/navigate check as residual Firefox evidence.
- Rollback removes the new session/driver/message/tool surfaces and the `tabs`
  permission together. Never retain session data in addon storage.
