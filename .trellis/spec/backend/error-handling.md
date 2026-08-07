# Backend Error Handling

## Current pattern

Expected peer/protocol failures are stable `ServerMessage` values defined in
`packages/contracts/src/index.ts`; unexpected server failures are contained at
the broker boundary. The protocol does not send stack traces or raw exception
messages to the addon.

```ts
socket.on("message", (rawData) => {
  void this.handleMessage(socket, rawData).catch(() => this.send(socket, errorMessage("INTERNAL_ERROR")));
});
```

Source: `apps/mcp-server/src/broker.ts`.

## Rules

- Validate untrusted WebSocket JSON with the shared Zod schema. Malformed or
  oversized messages return `MALFORMED_MESSAGE`.
- Return a declared error code for anticipated domain outcomes: invalid,
  expired, or used pairing codes and missing/revoked bindings. Use
  `errorMessage(code)` to preserve the wire shape. At present, unsupported or
  otherwise invalid client messages fail schema validation and return
  `MALFORMED_MESSAGE`; `UNKNOWN_MESSAGE` and `WRONG_STATE` are declared in the
  shared contract but have no Phase 0 broker emission path.
- Throw `Error` for invalid local/programmatic configuration and lifecycle
  misuse, such as an invalid port, non-loopback host, or double start. Let
  startup failures reject so the CLI exits rather than silently switching port.
- Catch only errors that have an intentional recovery path. The repository
  catches `ENOENT` as an unpaired state and rethrows other read/unlink errors.
- Keep MCP stdout protocol-clean. CLI diagnostics and startup errors belong on
  stderr; see `apps/mcp-server/src/cli.ts`.

## Do not do

- Return raw `Error.message`, stack traces, tokens, or pairing codes over the
  WebSocket/MCP boundary.
- Treat schema parse failure as a valid message with casts.
- Convert an occupied production port into a random-port fallback.

## Test evidence

`tests/phase0.test.ts` verifies expiry/reuse, revoked-token rejection,
occupied-port failure, and clean MCP stdio initialization. Add focused
malformed/oversized-message coverage whenever that parser behavior changes.
