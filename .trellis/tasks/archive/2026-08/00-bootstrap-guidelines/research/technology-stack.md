# Torii 技术栈梳理

## 结论状态

本文将产品 PRD 的明确要求与尚未落盘的工程选择分开记录。仓库当前没有
`package.json`、`tsconfig.json`、Firefox addon manifest 或源码；因此“建议”不能
被当作已有项目约定。

## 已确认的产品技术边界

| 领域 | 结论 | 证据 |
| --- | --- | --- |
| 产品形态 | 本地 Codex MCP 服务与 Firefox WebExtension 组合，不是独立网站或移动端前端。 | 根目录 `prd.md` 1.2、7 |
| 主语言 | TypeScript。 | 根目录 `prd.md` 11 阶段 0 |
| MCP 接入 | 本地子进程式 MCP stdio。 | 根目录 `prd.md` 7 |
| 扩展通信 | MCP Server/Local Broker 与 addon 之间为仅 loopback 的 WebSocket，受配对令牌保护。 | 根目录 `prd.md` 5.1、7、8 |
| Firefox addon | background、按需 content script 与 popup；popup 是扩展内 UI，不构成独立前端应用。 | 根目录 `prd.md` 7 |
| MVP 权限 | `activeTab`、`scripting`、`storage` 与本地 Broker 所需最小 host permission；不得引入 `debugger`、历史、书签、Cookie、下载或全站常驻权限。 | 根目录 `prd.md` 8、10.2 |
| 领域边界 | `mcp-server → session → driver interface → driver-webext / driver-bidi`。 | 根目录 `prd.md` 7.1 |
| 验证 | 单元测试、会话/归属/撤销集成测试，以及临时 Firefox profile 的端到端流程。 | 根目录 `prd.md` 10.3 |

参考目录 `refer/codex-cdp-crx/` 是高权限 Chrome 扩展产物；其 `debugger`、
`<all_urls>`、历史及下载权限与 Torii 的 PRD 冲突，只能用于理解边界，不能复制
到实现或规范中。`refer/devtools-protocol/` 同样仅为 CDP 参考资料，不是产品依赖。

## 已确认的阶段 0 基线

| 层 | 建议 | 原因 |
| --- | --- | --- |
| Node 运行时 | Node.js 20 或更高版本 | MCP TypeScript SDK 的官方快速开始以 Node.js 20+ 为前提。 |
| 语言与模块 | TypeScript strict + ESM | PRD 已指定 TypeScript；MCP 与 WebExtension 异步边界适合以类型和模块隔离。 |
| MCP | `@modelcontextprotocol/sdk` + `zod`，采用 `StdioServerTransport` | 符合本地、由 Codex 启动的 MCP stdio 架构；schema 可直接承担工具输入验证。 |
| Local Broker | Node HTTP server 仅绑定 `127.0.0.1`，在其上升级 WebSocket；令牌使用 `node:crypto` 生成 | 满足 loopback、配对、可撤销和不泄露令牌的安全不变量。具体 WebSocket 库尚未选择。 |
| Firefox addon | Manifest V3、TypeScript、`browser` Promise API、`scripting.executeScript()` 按需注入 | Firefox 支持 MV3 `scripting`；该方式可配合 `activeTab` 限制对当前用户授权标签页的访问。 |
| addon UI | popup 使用原生 HTML/CSS/TypeScript，不引入 React、Tailwind 或独立 SPA | 已由开发者确认；首版只需配对、状态与停止控制，不应因小型扩展页面引入网站前端栈。 |
| 开发/打包 | `web-ext` 运行与打包 addon；先用 TypeScript 编译而非引入通用 Web 应用框架 | `web-ext run` 默认临时 Firefox profile，直接匹配 PRD 的端到端环境。 |
| 测试 | Node 单元/集成测试 + addon 临时 profile smoke test；自动化 E2E harness 单列技术验证 | PRD 要求 E2E，但仓库尚无可证明的 Firefox 扩展自动化基线，不能虚构命令或测试框架。 |
| 持久化 | addon 使用 `browser.storage.local`；服务端只持久化所需的设备绑定元数据，拒绝日志记录令牌、输入值和页面正文 | 满足配对撤销、最小存储和审计隐私要求。 |

## 尚未确定，且不应伪装为既有规范的项目选择

- 包管理器与锁文件（建议从 `npm` 起步：MCP 官方快速开始和仅作参考的
  `devtools-protocol` 都使用 npm；若团队已有 pnpm/bun 偏好，应优先采用团队选择）。
- WebSocket 实现库、结构化日志库、精确的服务端数据目录策略。
- addon 的 TypeScript 编译布局和最终签名/分发流程。
- 自动化 Firefox E2E 的具体驱动与 CI 镜像；在它被验证前，不能将其列为可运行检查。
- Phase 3 的 BiDi 适配器；它是接口预留，不是 MVP 依赖。

## 需要避免的错误分类

Torii 没有传统的“前端应用”，但仍有 Firefox addon 层：popup、background 和
content script 均有 UI/浏览器行为约束。后续规范应以 `firefox-addon`（或
`extension`）层记录它们，而不是把它们塞入通用网页组件、React hook 或状态管理
规范中。

## 外部证据

- MCP TypeScript SDK 的本地 server 使用 `StdioServerTransport`；官方快速开始以
  Node.js 20+、`@modelcontextprotocol/sdk` 与 Zod 为基线：
  <https://ts.sdk.modelcontextprotocol.io/server>。
- Firefox 的 `scripting` API 支持 Manifest V2/V3，且按需注入需要 `scripting`
  和目标页面 host permission，或在用户操作下配合 `activeTab`：
  <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting>。
- `web-ext run` 默认使用临时 Firefox profile：
  <https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/>。
