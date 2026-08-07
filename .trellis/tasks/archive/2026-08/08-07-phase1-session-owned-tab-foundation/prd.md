# Phase 1: Session and Owned-Tab Foundation

## Goal

Let a paired Torii MCP client establish one active session and perform only the
minimal tab operations authorized by that session: list tabs, explicitly claim
a tab, open a new claimed tab, and navigate a claimed tab. This establishes the
ownership boundary required before snapshots and page interactions.

## Confirmed Facts

- The root product PRD assigns `browser_start_session`, `browser_end_session`,
  `browser_list_tabs`, `browser_claim_tab`, `browser_open`, and
  `browser_navigate` to the first MVP. Each operation must be scoped to an
  active session and claimed tab where applicable.
- Phase 0 already provides paired local transport: MCP stdio reaches
  `apps/mcp-server`, which owns the loopback Broker; the addon background owns
  Firefox API calls and browser storage. No page-control capability exists yet.
- `packages/contracts` is the shared schema/type boundary; `packages/session`
  is browser-independent and currently owns only pairing state. The root PRD
  fixes the dependency direction as `mcp-server → session → driver interface
  → driver-webext`.
- The addon currently has only `storage` and loopback WebSocket permission.
  Phase 1 needs the minimum reviewed Firefox permissions for tabs, a local
  MV3 background-recovery alarm, and
  user-authorized injection/navigation, and must not introduce `debugger`,
  history, bookmarks, cookies, downloads, native messaging, or `<all_urls>`.
- Current tests cover pairing and MCP initialization only. The project has no
  Playwright setup; `npm run addon:smoke` is an interactive Firefox loading
  check, not deterministic browser automation.

## Required Scope

1. Define shared schemas, stable error codes, and bounded outputs for the six
   foundation MCP tools; do not expose arbitrary protocol or script execution.
2. Add a browser-independent session lifecycle and one-session tab-claim
   ownership model. Operations must reject an inactive session and an
   unclaimed/foreign tab with stable errors.
3. Add the MCP-to-addon command boundary and Firefox background handling needed
   to list tabs, claim, open, and navigate. Browser API details must not leak
   into `contracts` or session state.
4. Invalidate a claim when its tab closes or becomes unusable; make navigation
   state explicit for the later snapshot/reference lifecycle task.
5. Update the popup only to the degree required to show active-session and
   controlled-tab state. Stop control, audit events, snapshots, content scripts,
   page reads, and page interaction are out of scope.
6. Add targeted unit/integration coverage for lifecycle, ownership rejection,
   navigation/open behavior, and addon command validation. Preserve the root
   typecheck/test/build checks and record any remaining manual Firefox evidence.
7. Accept only absolute `http` and `https` navigation URLs in this foundation.
   Allow navigation only after claim enforcement, and return a non-secret
   `new-tab` / `cross-origin` risk indicator for the later confirmation-policy
   layer; do not implement a confirmation prompt now.
8. Add Firefox's `tabs` permission solely to return the required tab title and
   URL metadata, plus `alarms` solely to wake the MV3 event page to restore a
   stored local binding. Defer `activeTab` and `scripting` until the snapshot
   task needs user-gesture-scoped page injection; do not add host access beyond
   the existing loopback Broker permission.
9. Keep exactly one claimed tab per active session. `browser_open` must create
   and claim its new tab atomically while releasing any existing claim; later
   multi-tab work owns any switching or retained-claim behavior.

## Out of Scope

- DOM snapshots, element references, content scripts, clicking, typing,
  keypresses, selection, scrolling, waits, screenshots, and arbitrary script
  execution.
- Multi-tab workflows, a BiDi/CDP driver, remote transport, new persistent
  browser data beyond what this ownership boundary requires, and final stop or
  audit UX.
- Replacing the current manual Firefox smoke boundary with unverified Playwright
  infrastructure.

## Acceptance Criteria

- [x] A paired MCP client can start and end an active session through typed
      tools; ending clears all claims and later operations return a stable
      inactive-session error.
- [x] The client can list tabs, claim exactly one tab for a session, open a new
      claimed tab, and navigate only the claimed tab through the addon boundary.
- [x] A request against an unclaimed, foreign, closed, or invalid tab fails with
      a stable ownership/lifecycle error and does not call the browser action.
- [x] The shared contracts and session package stay independent of Firefox APIs,
      WebSocket implementation details, and MCP SDK runtime objects.
- [x] The manifest requests only the reviewed `tabs` and `alarms` additions and
      retains every Phase 0 prohibited permission.
- [x] Unit/integration coverage exercises the session transitions, claim
      enforcement, message validation, and Firefox-facing command results;
      `npm run typecheck`, `npm test`, and `npm run build` pass.

## Key Decision

- A claimed tab or newly opened claimed tab may navigate directly to an absolute
  `http`/`https` URL. Cross-origin and newly opened destinations are explicitly
  surfaced as risk state; user confirmation policy is deferred to Phase 2.
- The addon receives Firefox's narrow `tabs` permission to list the required
  title and URL metadata and `alarms` to wake its own MV3 event page while a
  stored binding exists; no general webpage host permission, `activeTab`, or
  `scripting` permission is added in this task.
- `browser_open` atomically replaces the session's existing claim with its new
  tab. A session never holds multiple claims in this task.
