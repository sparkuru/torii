# Phase 1 Foundation Implementation Plan

1. Extend `packages/contracts` with foundation tool schemas, command/event
   messages, tab/result types, stable error codes, URL/risk helpers, and strict
   request-ID validation. Keep credentials and raw browser errors absent.
2. Implement the in-memory session manager and a browser-independent driver
   port in `packages/session`; test lifecycle, sole-claim replacement, invalid
   tab cleanup, and ownership-before-driver-call behavior.
3. Extend the Broker into an authenticated, correlated command transport and
   add a WebExtension driver adapter. Reject unavailable/unpaired extension
   requests without leaking transport details.
4. Register the six typed MCP tools in `apps/mcp-server`; parse every input,
   pass only validated values to the session/driver boundary, and keep stdout
   JSON-RPC-only.
5. Add `tabs` and the smallest accurate `browser.tabs` declarations. Extend
   addon background command handling for listing, lookup, create, navigate, and
   removal events; validate only `http`/`https` destinations.
6. Add popup session/controlled-tab presentation per the approved minimal
   status design, including loading/error/empty states and semantic status text.
7. Add Node unit/integration coverage and update README operational guidance;
   inspect the generated manifest and record browser-test effectiveness and the
   smallest manual Firefox procedure.
8. Run `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
   Run `npm run addon:smoke` when a usable Firefox GUI exists; otherwise record
   it as unavailable and request the exact manual path before submit-ready.

## Risk points

- Never treat an addon connection as sufficient authority: each operation still
  validates the session and sole claim before a browser command is sent.
- Do not leave an old claim after `browser_open`, tab removal, end, reload, or
  transport loss.
- Do not grant `<all_urls>`, embed browser APIs in `contracts`/`session`, or
  expose a generic JavaScript/browser protocol tool.
- Treat `tabs` title/URL visibility and every new navigation as privacy-relevant
  in test and manual review.
