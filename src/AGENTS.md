# src AGENTS.md

## Responsibility

`src/` contains all runtime code for FCoding: process startup, configuration, HTTP webhook handling, Feishu integration, and Codex CLI execution.

## Key Entry Files

- `index.js`: starts WS or HTTP mode based on `FEISHU_EVENT_MODE`.
- `config.js`: parses env vars and owns runtime defaults.
- `dotenv.js`: local `.env` loader.
- `server.js`: HTTP server plus shared `processCodexTask`.
- `feishu/`: Feishu-specific integration.
- `codex/`: Codex process execution.

## Internal Dependencies

- `index.js` depends on `dotenv.js`, `config.js`, `server.js`, `feishu/client.js`, and `feishu/ws.js`.
- `server.js` depends on `codex/runner.js`, `feishu/crypto.js`, and `feishu/events.js`.
- `feishu/ws.js` imports `processCodexTask` from `server.js`; changes to task orchestration affect both WS and HTTP behavior.

## Safer Changes

- Adding pure config parsing tests for new env vars.
- Adding helper functions with direct unit tests.
- Improving logging without leaking secrets.
- Updating output formatting when tests cover both success and failure.

## High-Risk Changes

- Changing `processCodexTask`; it is shared by WS and HTTP paths.
- Changing config defaults in `config.js`; `.env.example`, README, and agent docs may need updates.
- Changing startup mode selection in `index.js`; this can break local long connection operation.
- Changing callback timing; Feishu may retry or show user-facing errors if handlers block or return invalid payloads.

## Minimum Verification

- Any `src/` runtime change: `npm test`.
- Config changes: `node --test test/config.test.js test/dotenv.test.js`.
- HTTP server changes: `node --test test/server.test.js`.
- Shared task orchestration changes: `node --test test/server.test.js test/feishu-ws.test.js test/codex-runner.test.js`.

## Read Before Editing

- `../AGENTS.md`
- `../docs/agent-context/project-map.md`
- `../docs/agent-context/change-safety.md`
- The specific module's test file in `../test/`
