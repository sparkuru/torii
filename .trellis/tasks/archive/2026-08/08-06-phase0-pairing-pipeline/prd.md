# Phase 0：本地配对链路

## 目标

建立可在本机运行的最小可信链路：Codex 能通过 MCP stdio 启动 Torii 服务，
用户可将 Firefox addon 与该服务配对，popup 能显示连接状态并撤销绑定。该任务
只验证跨进程、跨浏览器边界与撤销边界；不自动化任何网页。

## 已确认事实

- 根目录产品 PRD 将 Torii 定义为本地 TypeScript MCP 服务与 Firefox
  WebExtension 的组合，服务到 addon 的通信为受配对令牌保护的 loopback
  WebSocket。
- MVP 不允许任意 CDP、BiDi 或页面 JavaScript 透传，也不允许控制未认领标签页。
- addon 采用 Manifest V3 和原生 HTML/CSS/TypeScript popup，不引入 React、
  Tailwind 或独立 SPA。
- 当前环境有 Node.js 20.19.2、npm 9.2.0 与 Firefox 140.13.0 ESR；尚无
  `web-ext`，因此其安装和可运行命令属于本任务交付的一部分。

## 范围

### 包含

- 建立 TypeScript/ESM 项目、npm scripts 与最小模块目录。
- 启动本地 MCP stdio server；协议 stdout 仅用于 MCP JSON-RPC，诊断信息不得
  污染 stdout。
- 在 MCP server 进程内启动只监听 `127.0.0.1` 的 Broker，并生成短时、一次性的
  配对码。
- Firefox Manifest V3 addon：background 维护 Broker 连接，popup 允许提交配对
  信息、显示 `unpaired` / `paired` / `disconnected`，并提供撤销绑定操作。
- Broker 固定监听 `127.0.0.1:32145`。popup 以该端口为默认值，并将端口修改留作
  可见的高级设置；服务不会在端口占用时静默改用随机端口。
- 服务端与 addon 持久化必要的设备绑定状态；配对令牌、明文输入和页面正文不得
  出现在普通日志或 MCP 输出中。
- 以自动化 Node 测试验证配对状态机和撤销；以临时 Firefox profile 完成可复现
  的 addon 启动/加载 smoke test。
- 提供本地运行、配对和撤销的最短操作文档。

### 不包含

- 标签页发现或认领、导航、快照、点击、输入、按键、滚动、等待和截图。
- content script 注入、任何网页读取或交互。
- `driver-bidi`、Chrome/CDP 驱动、`debugger` 权限、native messaging、远程访问
  或局域网绑定。
- Firefox addon 的签名、发布或生产安装器。
- 在未验证自动化方案前承诺完整 Firefox E2E 回归套件。

## 需求

1. Broker 只可绑定 `127.0.0.1`；配置或命令行不得提供绑定到局域网/公网的路径。
   默认端口为 `32145`。端口已被占用时，服务必须安全失败并在 stderr 提示，而非
   改绑其他端口。
2. 服务启动时默认未配对，生成的配对码须短时有效、仅能成功使用一次，并且不能
   经 stdout、MCP tool output 或普通日志泄露。
3. addon 仅在用户在 popup 中明确发起配对后连接 Broker；成功后双方保存设备绑定
   所需的最小状态。
4. popup 必须可见地显示配对与连接状态；撤销绑定必须使本地保存的绑定状态失效并
   让 Broker 拒绝该设备的后续请求。
5. 断开、过期配对码、错误配对码与撤销后的令牌必须产生可处理、无敏感信息的错误。
6. 实现不得请求 `debugger`、history、bookmarks、cookies、downloads、nativeMessaging
   或 `<all_urls>` 权限。
7. Node 测试与 Firefox 临时 profile smoke test 的实际命令必须记录在项目文档中；
   不能将尚未安装或不可执行的检查报告为通过。

## 验收标准

- [ ] 通过 npm script 启动服务时，MCP stdio 握手可用，且 stdout 不含非协议日志。
- [ ] Broker 的监听地址经测试确认仅为 `127.0.0.1`。
- [ ] 用户可从服务诊断输出取得一次性配对信息，并在 addon popup 中完成配对；
      popup 随后显示已连接状态。
- [ ] 错误或过期配对码不建立绑定，且不会在日志、MCP 输出或 popup 中回显密钥。
- [ ] 重复使用已成功的配对码失败。
- [ ] popup 的撤销操作会清理绑定；同一 addon 后续连接被 Broker 拒绝，直到重新
      配对。
- [ ] addon 可由项目脚本在全新临时 Firefox profile 中加载，且不请求被禁止权限。
- [ ] Node 单元/集成测试覆盖配对、重复配对码、撤销与 loopback 绑定约束。
- [ ] README 说明安装、启动、配对、撤销和当前已知的测试边界。

## 依赖与参考

- 根目录 `prd.md`：产品范围、安全约束与阶段 0 要求。
- `.trellis/tasks/00-bootstrap-guidelines/research/technology-stack.md`：已确认的
  TypeScript、MCP、Firefox addon 与测试基线。
