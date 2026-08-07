# Browser Broker Contract

## Scenario: Local Firefox Pairing Boundary

### 1. Scope / Trigger

Use this contract when changing MCP startup, the loopback Broker, pairing
persistence, or Firefox addon pairing/revocation. These are one cross-layer
boundary, not independent server and addon changes.

### 2. Signatures

- `startTorii({ port?, stateDirectory?, connectStdio? })` starts the runtime.
- `TORII_BROKER_PORT` accepts only integer `1..65535`; default is `32145`.
- Broker host is always `127.0.0.1`.
- Client messages: `{ kind: "pair", code }`, `{ kind: "authenticate", token }`,
  `{ kind: "revoke", token }`.
- Server messages: `{ kind: "paired", token }`, `{ kind: "authenticated" }`,
  `{ kind: "revoked" }`, `{ kind: "error", code }`.

### 3. Contracts

- MCP JSON-RPC owns stdout; startup diagnostics and errors go to stderr.
- Codes are short-lived and one-use. Server persistence stores only a token hash;
  the addon stores its binding in `browser.storage.local`.
- Revocation deletes the server record, closes sockets for that token, and clears
  addon storage even if the Broker cannot acknowledge it.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| malformed or oversized JSON | `MALFORMED_MESSAGE` |
| expired or reused pairing code | `PAIRING_CODE_EXPIRED` / `PAIRING_CODE_USED` |
| unknown/revoked binding | `BINDING_REVOKED` |
| unexpected handler failure | `INTERNAL_ERROR` without details |
| occupied default port | startup failure on stderr; no random-port fallback |

### 5. Good/Base/Bad Cases

- Good: pair through `ws://127.0.0.1:32145`, then reconnect with the binding.
- Base: `TORII_BROKER_PORT=32146` changes only the port, never the host.
- Bad: binding to `0.0.0.0`, logging codes/tokens, or adding `<all_urls>`.

### 6. Tests Required

- Test code expiry/reuse, reconnect, revoke, file removal, `0700`/`0600` modes,
  loopback binding, occupied port, and clean MCP stdout.
- Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run addon:smoke`.
- Manually pair and revoke in the popup until a deterministic addon E2E exists.

### 7. Wrong vs Correct

```ts
// Wrong: exposes the Broker and corrupts MCP stdout.
new WebSocketServer({ host: "0.0.0.0", port });
console.log(code);

// Correct.
new WebSocketServer({ host: "127.0.0.1", port });
process.stderr.write("Torii broker ready\n");
```

## Scenario: Session-Owned Firefox Tab Commands

### 1. Scope / Trigger

Phase 1 adds six MCP tools and an authenticated Broker-to-addon command channel
for one active session and one controlled Firefox tab. This is a cross-layer
contract: changing a tool, command kind, request ID, tab state, or error code
requires updating `packages/contracts`, the server/Broker/driver, and addon
background together.

### 2. Signatures

- MCP tools: `browser_start_session({ intent })`,
  `browser_end_session({ session_id })`, `browser_list_tabs({ session_id })`,
  `browser_claim_tab({ session_id, tab_id })`,
  `browser_open({ session_id, url })`, and
  `browser_navigate({ session_id, tab_id, url })`.
- `SessionManager` owns `start`, `end`, `listTabs`, `claimTab`, `openTab`,
  `navigateTab`, and `tabRemoved`; `BrowserDriver` is its browser-independent
  port.
- Broker command: `{ kind: "command", requestId, command }`; addon result:
  `{ kind: "command-result", requestId, result }`; addon invalidation event:
  `{ kind: "tab-removed", tabId }`.
- Commands are `list-tabs`, `get-tab`, `open-tab`, and `navigate-tab`. Tab
  metadata is `{ id, title, url, active }`.

### 3. Contracts

- Validate every MCP input and every WebSocket payload with the shared Zod
  schemas in `packages/contracts/src/index.ts`; do not locally cast payloads.
- A session is in-memory only. It has at most one claim. `browser_open` creates
  a tab and atomically replaces the previous claim; it never closes that older
  tab. End, authenticated transport loss, and matching `tab-removed` clear
  state.
- `browser_navigate` verifies the claimed tab before dispatching a command.
  URLs must be absolute `http` or `https`; open returns `{ new_tab: true }`,
  and navigate returns whether the destination is cross-origin.
- The Broker sends commands only to an authenticated addon socket and correlates
  results to the issuing socket and UUID request ID. Pending work becomes a
  non-secret unavailable/timeout error on transport loss or expiry.
- When the final authenticated socket disconnects, the Broker holds the active
  session for a single matching binding token for 10 seconds. It dispatches no
  browser command while no socket is live. Only that exact token can recover
  the session; pairing replacement, revocation, grace expiry, Broker shutdown,
  or failed authentication during the grace window ends it. An invalid
  authentication attempt must not disrupt a separate live authenticated socket.
- The addon alone calls `browser.tabs`. Its manifest has `tabs` to return title
  and URL metadata; do not add page host permissions, `activeTab`, `scripting`,
  content scripts, or prohibited browser privileges for this boundary.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| no active/matching session | `SESSION_NOT_ACTIVE` |
| second active session | `SESSION_ALREADY_ACTIVE` |
| tab differs from the sole claim | `TAB_NOT_CLAIMED`; do not dispatch browser work |
| Firefox cannot find the tab | `TAB_NOT_FOUND`; clear a failed navigation claim |
| non-HTTP(S) or malformed URL | `INVALID_URL` |
| Firefox navigation failure | `NAVIGATION_FAILED` without raw browser details |
| no authenticated addon / socket closes | `DRIVER_UNAVAILABLE` |
| same binding reconnects within 10 seconds | session may resume after authentication |
| missing/wrong binding during reconnect grace | end the session; return `BINDING_REVOKED` |
| reconnect grace expires | end the session |
| command has no response within five seconds | `DRIVER_TIMEOUT` |
| malformed/cross-socket command result | reject or ignore it; never complete another request |

### 5. Good / Base / Bad Cases

- Good: start a session, list tabs, claim one ID, then navigate that exact ID.
  A `tab-removed` event clears the claim before any later navigation.
- Base: opening an `https` URL makes the returned new tab the only claim and
  reports `new_tab`; the prior tab stays visible but uncontrolled.
- Bad: call `browser.tabs.update` before `SessionManager` validates ownership,
  accept `file:`/`about:` URLs, retain a claim after socket loss, or let a
  second socket resolve the first socket's command request.

### 6. Tests Required

- Unit-test session start/end, sole-claim replacement, unclaimed/foreign tab
  rejection before driver invocation, tab removal, URL rejection, and risk
  flags.
- Integration-test command correlation, unauthenticated rejection, socket-loss
  cleanup, same-token reconnect grace, invalid-auth isolation for a live socket,
  driver failure/timeout mapping, MCP tool schemas, and clean stdout.
- Inspect built `apps/firefox-addon/dist/manifest.json` for only `storage`,
  `tabs`, and loopback WebSocket host access. Run `npm run typecheck`,
  `npm test`, and `npm run build`.
- Playwright is not configured/effective for this extension runtime. Run the
  addon smoke command when possible and manually pair → session → claim/open/
  navigate → close claimed tab → revoke until deterministic coverage exists.

### 7. Wrong vs Correct

```ts
// Wrong: browser authority is exercised before the domain ownership boundary.
await driver.navigateTab(tabId, url);
session.requireClaim(sessionId, tabId);

// Correct: ownership is verified first; only the claimed tab reaches driver.
await session.navigateTab(sessionId, tabId, url);
```

## Scenario: Addon Recovery and Settled Navigation

### 1. Scope / Trigger

Apply this when changing the persistent authenticated addon socket or the
`open-tab`/`navigate-tab` implementations. Firefox can publish an immediate
tab snapshot before navigation settles; the popup is a status surface and must
not be the event that makes a saved binding usable.

### 2. Signatures

- On background load, call `scheduleReconnect(0)`, which resumes a stored
  `{ token, port }` binding with `{ kind: "authenticate", token }`.
- `browser.alarms` uses the single `torii-reconnect` alarm at
  `periodInMinutes: 0.1`; the manifest grants only the `alarms` API permission
  in addition to the existing `storage` and `tabs` permissions.
- `waitForNavigationSettled(tabId, requestedUrl): Promise<BrowserTab>` listens
  to `browser.tabs.onUpdated` before an update and is bounded by
  `NAVIGATION_SETTLE_TIMEOUT_MS` (5,000 ms).
- The existing browser command result stays `{ kind: "tab", tab }` or
  `{ kind: "error", code }`; no popup-specific command is introduced.

### 3. Contracts

- A successful stored-binding authentication keeps the command socket open.
  After a genuine authenticated socket loss, retry authentication; intentional
  closes for pair, revoke, and cleanup must not schedule a competing retry.
- Popup `get-state` may refresh presentation, but connection recovery must also
  happen when the background loads with no popup open.
- MV3 event pages cannot rely on DOM timers surviving idle suspension. A valid
  stored binding owns the named alarm, whose top-level listener resumes only
  that stored binding when no socket is open or connecting. Pair/startup/popup/
  alarm recovery shares one in-flight operation. Every binding-clear path
  clears the alarm, including revoke, rejected authentication, invalid storage,
  and a storage-removal failure.
- Register the navigation watcher before `tabs.update`. Return the settled tab
  metadata only after a URL change has been observed and the tab reports
  `status: "complete"`; redirects may produce a final URL different from the
  requested URL.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| saved binding and broker is available | authenticate automatically; status becomes `paired` |
| genuine authenticated socket close | retry stored-binding authentication |
| deliberate pair/revoke/cleanup socket close | no reconnect attempt from that close |
| `torii-reconnect` alarm with valid binding and no live socket | wake the event page and authenticate the stored binding |
| no valid binding, revoked binding, or binding cleanup | remove `torii-reconnect`; do not schedule wakeups |
| navigation settles before 5 seconds | return final `{ id, title, url, active }` |
| navigation does not settle within 5 seconds | `DRIVER_TIMEOUT` |
| tab disappears during update or settlement | `TAB_NOT_FOUND`; `SessionManager` clears the claim |

### 5. Good / Base / Bad Cases

- Good: reload the addon background, leave the popup closed, then use an MCP
  session to list and claim tabs through the restored binding.
- Base: while paired, Firefox idles the MV3 event page; its next local alarm
  wake restores only the saved loopback binding without opening the popup.
- Base: `https://google.com` redirects; return the loaded Google URL/title,
  not an earlier `about:blank` snapshot.
- Bad: reconnect merely because a deliberate revoke closed the socket, attach
  `onUpdated` after `tabs.update`, retain an alarm after binding removal, or
  immediately return the value of `tabs.create`/`tabs.update` as final
  navigation metadata.

### 6. Tests Required

- Cover driver propagation of settled tab metadata, `DRIVER_TIMEOUT`, and
  `TAB_NOT_FOUND` so the session invalidation path remains reachable.
- Manually pair once, close the popup, reload the addon/background, and verify
  an MCP session/list/claim works without reopening the popup.
- Assert the generated manifest permits exactly `storage`, `tabs`, and
  `alarms`; pair, let the worker idle, wait for an alarm interval, and verify
  recovery without opening the popup. Revoke and verify the named alarm is
  cleared.
- Manually open then navigate a claimed HTTPS tab; each tool result must show
  post-navigation metadata, not the preceding page.

### 7. Wrong vs Correct

```ts
// Wrong: the popup becomes the only reconnection trigger, and the command
// returns a stale Firefox snapshot.
await browser.tabs.update(tabId, { url });
return browser.tabs.get(tabId);

// Correct: an alarm wakes an idle MV3 event page only while a binding exists;
// recovery remains binding-scoped and navigation waits for settlement.
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "torii-reconnect") void resumeAuthenticatedConnection();
});
scheduleReconnect(0);
const settled = await waitForNavigationSettled(tabId, url);
return settled;
```
