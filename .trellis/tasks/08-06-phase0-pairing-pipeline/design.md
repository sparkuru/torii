# Phase 0 技术设计

## 架构

```text
Codex / MCP test client
  │ stdio (JSON-RPC only)
  ▼
apps/mcp-server
  ├─ starts Broker on ws://127.0.0.1:32145
  ├─ emits non-secret pairing instructions to stderr
  └─ owns pairing state and device-binding persistence
       │ WebSocket, local host only
       ▼
apps/firefox-addon
  ├─ background: one Broker connection and message validation
  ├─ popup: pairing code, state display, revoke action
  └─ browser.storage.local: device binding material
```

The initial repository uses npm workspaces and TypeScript strict/ESM:

```text
apps/mcp-server/          MCP stdio entry point and loopback broker
apps/firefox-addon/       Manifest V3 addon source and generated build
packages/contracts/       transport message, error, and state schemas
packages/session/         pairing state machine and persistence boundary
tests/                    Node unit/integration tests and addon smoke harness
```

`contracts` and `session` must not import Firefox APIs, WebSocket transport
objects, or MCP SDK types. `mcp-server` may depend on `session` and broker
transport code; the Firefox addon implements the client side only.

## Runtime and dependencies

- Node.js 20+, TypeScript strict, ESM, npm workspaces.
- `@modelcontextprotocol/sdk` and Zod for the MCP stdio server and tool/schema
  boundary. Phase 0 validates MCP initialization; browser-control tools remain
  a later task.
- `ws` for the Node-side WebSocket server. Browser addon uses the platform
  `WebSocket` API and no Socket.IO layer.
- `env-paths` (or an equivalently small cross-platform path helper) for a
  user-scoped, non-repository service-state directory; persisted data must be
  created with owner-only permissions where the platform permits it.
- `web-ext` as a development dependency for addon run/build smoke tests.

## Pairing state and messages

Service state is `unpaired → pairing-open → paired`; revocation returns it to
`unpaired`. The extension has `unpaired`, `connecting`, `paired`, and
`disconnected` presentation states. The addon must not retry indefinitely after
a revocation or authentication rejection.

1. Service starts the loopback broker on the fixed port. If binding fails,
   startup fails; it does not fall back to another interface or random port.
2. Service creates a short-lived, one-use pairing code with `node:crypto` and
   emits only operator-safe instructions to stderr.
3. User explicitly opens the popup and submits the code. The background opens
   `ws://127.0.0.1:32145` and sends a schema-validated pairing request.
4. Broker validates code freshness and single use, creates a high-entropy
   device-binding token, persists its server-side verifier/record, and returns
   binding material only over the established WebSocket.
5. Background writes the minimum binding material to `browser.storage.local`;
   popup displays `paired` but never displays or logs the token.
6. On reconnect, the addon authenticates with its stored binding material.
   Unknown, revoked, or malformed material is rejected and the addon returns to
   `unpaired` after clearing stale local state.
7. Revoke is an explicit popup action: background asks the Broker to revoke,
   clears addon storage regardless of a lost acknowledgement, and the Broker
   invalidates its record. A stale connection is closed.

Message schemas are defined in `packages/contracts`. Unknown message kinds,
malformed JSON, oversized input, wrong state, expired code, reused code, and
revoked binding produce stable non-secret error codes. Tokens and pairing codes
are excluded from ordinary structured logs and MCP stdout.

## Firefox permissions and UI

The Phase 0 manifest contains only the minimum addon and local-connection
permissions required by the implemented behavior. It must not include
`debugger`, history, bookmarks, cookies, downloads, `nativeMessaging`,
`<all_urls>`, content scripts, or host permissions for ordinary webpages.

The popup is a small native HTML/CSS/TypeScript page. It has a pairing-code
input, a status label, a revoke button only when paired, and an advanced port
field initialized to `32145`. The fixed default preserves a zero-friction path;
the editable field handles local port conflicts without exposing any non-loopback
address option.

## Verification and failure handling

- Node tests use a separate temporary state directory and dynamically allocated
  test port; production default-port behavior is tested separately. Tests prove
  that the production listener rejects non-loopback configuration and fails when
  port `32145` is occupied.
- A process-level MCP test client performs the stdio initialization handshake
  and asserts no unexpected stdout text.
- Broker integration tests cover valid pairing, invalid/expired/reused codes,
  reconnect, revoke, and rejection after revoke.
- `web-ext run` loads the addon in a new temporary Firefox profile. This is a
  smoke check, not an assertion that a complete E2E driver exists.
- The manual handoff documents the one required visual check: popup can pair,
  show state, and revoke against a locally started Broker.

## Deferred work

Session tools, tab claim, navigation, content-script injection, snapshots,
browser interaction, BiDi/CDP adapters, remote transport, production signing,
and fully automated Firefox addon E2E remain separate work. The fixed endpoint
does not imply a public service: `127.0.0.1` remains mandatory.
