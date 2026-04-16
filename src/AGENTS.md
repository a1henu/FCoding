# src AGENTS.md

## Responsibility

`src/` contains all runtime code for FCoding: process startup, configuration, HTTP webhook handling, Feishu integration, runtime session state, built-in bot commands, and Codex CLI execution.

## Key Entry Files

- `index.js`: starts WS or HTTP mode based on `FEISHU_EVENT_MODE`.
- `config.js`: parses env vars and owns runtime defaults.
- `commands.js`: handles built-in FCoding commands such as `status`, `workspace`, `model`, `login`, and `cancel`.
- `dotenv.js`: local `.env` loader.
- `index.js` loads `.env` before config/runtime state are created.
- `runtime-state.js`: in-memory runtime overrides, active task cancellation state, and card state.
- `server.js`: HTTP server plus shared `processCodexTask`.
- `feishu/`: Feishu-specific integration.
- `codex/`: Codex process execution.

## Internal Dependencies

- `index.js` depends on `dotenv.js`, `config.js`, `runtime-state.js`, `server.js`, `feishu/client.js`, and `feishu/ws.js`.
- `server.js` depends on `commands.js`, `runtime-state.js`, `codex/runner.js`, `feishu/crypto.js`, `feishu/events.js`, and card builders.
- `commands.js` depends on `runtime-state.js` and Feishu card builders.
- `feishu/ws.js` imports `processCodexTask` from `server.js` and runtime state support; changes to task orchestration affect both WS and HTTP behavior.

## Safer Changes

- Adding pure config parsing tests for new env vars.
- Adding helper functions with direct unit tests.
- Improving logging without leaking secrets.
- Updating output formatting when tests cover both success and failure.
- Adding built-in commands when they are handled before Codex execution and covered in `test/server.test.js`.

## High-Risk Changes

- Changing `processCodexTask`; it is shared by WS and HTTP paths.
- Changing `handleBotCommand`; command prompts bypass Codex and affect user-visible bot behavior.
- Changing `runtime-state.js`; it controls workspace/model overrides, active task cancellation, and card output expansion state.
- Changing config defaults in `config.js`; `.env.example`, README, and agent docs may need updates.
- Changing dotenv loading; this affects local secret handling.
- Changing startup mode selection in `index.js`; this can break local long connection operation.
- Changing callback timing; Feishu may retry or show user-facing errors if handlers block or return invalid payloads.

## Minimum Verification

- Any `src/` runtime change: `npm test`.
- Config changes: `node --test test/config.test.js test/dotenv.test.js`.
- Dotenv loading changes: `node --test test/dotenv.test.js test/runtime-state.test.js`.
- Command/runtime-state changes: `node --test test/runtime-state.test.js test/server.test.js test/feishu-ws.test.js`.
- Cancellation changes: `node --test test/codex-runner.test.js test/runtime-state.test.js test/server.test.js test/feishu-ws.test.js`.
- HTTP server changes: `node --test test/server.test.js`.
- Shared task orchestration changes: `node --test test/server.test.js test/feishu-ws.test.js test/codex-runner.test.js`.

## Read Before Editing

- `../AGENTS.md`
- `../docs/agent-context/project-map.md`
- `../docs/agent-context/change-safety.md`
- The specific module's test file in `../test/`
