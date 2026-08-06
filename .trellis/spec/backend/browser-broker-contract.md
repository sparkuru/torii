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
