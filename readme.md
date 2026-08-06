# torii

本质是让受用户约束的代理，经由受控通道进入指定浏览器标签页执行操作

不变量是：跨界、受限、可撤销、受召唤

鳥居（Torii）是神域与日常世界之间的边界与入口：鸟居标记边界穿过它才进入另一侧空间所以不是目的地而是作为进入目的地的门

---

vibe with trellis and codex.

## Phase 0: local pairing

Torii Phase 0 establishes a local pairing channel only. It does not yet read or
control web pages.

### Requirements

- Node.js 20 or later
- Firefox (for the addon smoke/manual check)

### Install and run

```sh
npm install
npm run build
npm start
```

The MCP server uses stdin/stdout exclusively for MCP JSON-RPC. Startup
diagnostics, including the short-lived one-time pairing code, are written to
stderr. The broker listens only at `ws://127.0.0.1:32145`; it exits instead of
choosing another interface or port if that port is unavailable.

In another terminal, launch a temporary Firefox profile with the addon:

```sh
npm run addon:smoke
```

Open the addon popup, enter the pairing code printed by `npm start`, and choose
Pair. The popup stores the device binding in Firefox local extension storage.
Use **Revoke binding** in that popup to remove the local binding and invalidate
it at the broker. If the broker is unavailable when revoking, the addon still
removes its local copy.

The popup's Advanced section defaults to port `32145`. It accepts only a port
number and always connects to `127.0.0.1`; it never accepts a hostname.
If that port is occupied, choose an explicit alternative for both processes:

```sh
TORII_BROKER_PORT=32146 npm start
```

The service still binds only to `127.0.0.1`; `TORII_BROKER_PORT` accepts an
integer from `1` through `65535` and never chooses a port automatically.

### Checks

```sh
npm run typecheck
npm test
npm run build
npm run addon:smoke
```

`addon:smoke` starts Firefox with a fresh temporary profile and loads the
unpacked addon. It is a loading smoke test, not automated popup interaction.
The remaining manual check is to pair and revoke once using that profile.
