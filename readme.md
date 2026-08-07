# torii

本质是让受用户约束的代理，经由受控通道进入指定浏览器标签页执行操作

不变量是：跨界、受限、可撤销、受召唤

鳥居（Torii）是神域与日常世界之间的边界与入口：鸟居标记边界穿过它才进入另一侧空间所以不是目的地而是作为进入目的地的门

---

vibe with trellis and codex.

## Phase 1: paired, session-owned tabs

Torii establishes a local pairing channel and exposes a deliberately narrow
Firefox tab foundation. A paired MCP client can start one in-memory session,
list tabs, claim one tab, open a new claimed tab, and navigate only that
claimed tab to an absolute `http` or `https` URL. Opening a tab replaces the
previous claim. There is no page reading, DOM snapshot, script execution,
content script, click, typing, screenshot, download, or multi-tab workflow.

The server returns `new_tab` and `cross_origin` risk metadata for opening and
navigating; these are visible signals for a later consent policy, not prompts.
When the claimed tab closes, the addon disconnects, the session ends, or the
MCP process restarts, the in-memory claim is cleared.

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

The addon requests only `storage`, Firefox's `tabs`, and a local `alarms`
permission, plus its existing loopback WebSocket host permission. The named
six-second alarm exists only while a stored pairing binding exists and wakes
the extension to restore that binding's authenticated loopback socket. It does
not grant page, host, or browser-data access. The addon does not request `activeTab`,
`scripting`, general webpage host access, debugger, history, bookmarks,
cookies, downloads, or native messaging.

### Manual Firefox verification

`npm run addon:smoke` is an interactive Firefox loading check, not browser
automation. With `npm start` running, load the temporary addon, pair it in the
popup, and connect an MCP client. Start a session, list tabs, claim a tab, open
an `https` tab, and navigate that newly claimed tab. Confirm the popup reports
the active session and controlled tab; then close that tab and confirm the next
navigate call returns `TAB_NOT_CLAIMED`. End the session and revoke the binding.
After closing the popup or letting the background worker release, wait for the
six-second reconnect alarm and verify the stored binding restores the local
socket without reopening the popup. Revoking the binding removes that alarm.
No Playwright setup exists in this repository, so Playwright is not effective
for this extension-runtime path.

### Checks

```sh
npm run typecheck
npm test
npm run build
npm run addon:smoke
```

`addon:smoke` starts Firefox with a fresh temporary profile and loads the
unpacked addon. It is a loading smoke test, not automated popup interaction.
Run the manual Firefox verification above after permission, pairing, or
session-owned tab changes.
