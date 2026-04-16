# AGENTS.md

## Project Overview

FCoding is a local Feishu bot bridge for running Codex CLI tasks from Feishu messages. The default mode is Feishu long connection over `@larksuiteoapi/node-sdk`; HTTP webhook mode exists for deployments with a public HTTPS callback URL.

Core runtime flow:

1. `src/index.js` loads `.env`, parses config, creates `FeishuClient`, and starts either WS or HTTP mode.
2. Feishu message events are parsed and filtered by `src/feishu/events.js`.
3. Accepted text messages become Codex tasks.
4. `src/server.js#processCodexTask` handles built-in FCoding commands before invoking Codex.
5. Runtime overrides such as workspace, model, auth mode, and output-card state live in `src/runtime-state.js`.
6. Codex output and progress are sent as interactive Feishu cards through `src/feishu/client.js`.
7. Interactive card callbacks are handled in `src/feishu/ws.js` and card payloads live in `src/feishu/cards.js`.

## Top-Level Directory Map

- `src/`: runtime code. Read `src/AGENTS.md` before editing.
- `src/feishu/`: Feishu API, event parsing, crypto, long connection, cards. Read `src/feishu/AGENTS.md`.
- `src/codex/`: Codex CLI process runner and result formatting. Read `src/codex/AGENTS.md`.
- `test/`: Node built-in test suite mirroring source modules. Read `test/AGENTS.md`.
- `docs/`: human and agent documentation. Read `docs/AGENTS.md` before changing docs.
- `docs/agent-context/`: durable project context for future agents.
- `.github/workflows/test.yml`: GitHub Actions workflow that runs `npm ci` and `npm test` on push and pull request.
- `.env.example`: safe configuration template. Keep tracked and secret-free.
- `.env`: local secrets and runtime config. Must stay untracked.
- `.codex`: local Codex state/config. Must stay untracked.
- `package.json`: source of truth for scripts and runtime dependency declarations.

## Source Of Truth

- Runtime entry: `src/index.js`.
- Config defaults and env parsing: `src/config.js`.
- Long connection behavior: `src/feishu/ws.js`.
- HTTP callback behavior: `src/server.js`.
- Built-in bot commands: `src/commands.js`.
- Runtime session state and Codex run overrides: `src/runtime-state.js`.
- Feishu task extraction and allowlists: `src/feishu/events.js`.
- Feishu outbound API calls: `src/feishu/client.js`.
- Codex execution contract: `src/codex/runner.js`.
- Safe install instructions for agents: `docs/agent-installation.md`.
- Architecture and current collaboration context: `docs/agent-context/project-map.md`.

## Common Commands

```bash
npm install
npm test
npm audit --json
git diff --check
git status --short
npm start
```

Use `npm start` only when you need to run the local service. It reads `.env` and may connect to Feishu. If an existing `node src/index.js` process is running, coordinate before restarting it.

## Global Development Constraints

- Never commit `.env`, `.env.*`, `.codex`, `node_modules`, logs, or runtime secrets.
- Do not print `FEISHU_APP_SECRET`, tenant tokens, full `.env`, or user private identifiers unless explicitly needed and redacted.
- Prefer long connection mode. HTTP mode is supported but not the default user path.
- Keep event handlers quick. Long Codex work should run asynchronously after Feishu has been acknowledged.
- Keep code dependency-light. The current project uses Node ESM and Node's built-in test runner.
- Preserve the default Codex args unless `codex exec --help` confirms a replacement is valid.
- When changing Feishu event parsing, consider both WS mode and HTTP mode.
- When changing card callbacks, remember Feishu must subscribe to `card.action.trigger`; a healthy WS connection alone is not enough.
- Keep `.github/workflows/test.yml` aligned with `package.json` scripts. CI currently runs only `npm test`.

## Change Workflow

1. Read the nearest `AGENTS.md` plus relevant files listed there.
2. Check `git status --short`.
3. Make a focused change with matching tests.
4. Run the minimum targeted tests for the touched module, then run `npm test` before finalizing.
5. Run `git diff --check`.
6. Inspect staged diff for secrets before committing.
7. Commit focused slices. Push only after tests pass and the worktree contains no unintended changes.

## Parallel Work Guidance

- Safe parallel lanes: docs, Feishu client/API tests, Codex runner tests, HTTP server tests, card payload tests.
- Coordinate before editing: `src/config.js`, `src/server.js`, `src/commands.js`, `src/runtime-state.js`, `src/feishu/ws.js`, `src/feishu/events.js`, `.env.example`, `package.json`, `.github/workflows/test.yml`.
- Avoid two agents editing the same test file unless they own disjoint scenarios.
- Prefer adding new focused tests over broad rewrites when working in parallel.

## Review Checklist

- Does the change preserve `.env` secrecy and ignore rules?
- Does it keep long connection as the default path?
- Are Feishu event subscriptions, permissions, and callback types documented when relevant?
- Does every changed runtime behavior have a test?
- Are built-in commands documented and covered by server/runtime-state tests?
- Did message/task parsing still reject unsupported event types and non-text messages?
- Did Codex execution still handle success, failure, timeout, and output truncation?
- Does the change avoid blocking Feishu callbacks on long-running Codex work?
- Did `npm test`, `git diff --check`, and any relevant smoke checks pass? If CI config changed, did `.github/workflows/test.yml` still run the intended commands?
- Are docs updated when user setup, event subscriptions, env vars, or operational behavior changed?
