# Agent Project Guide

This document is written for AI coding agents that need to understand or extend FCoding.

## Project Purpose

FCoding bridges Feishu bot messages to local Codex CLI tasks:

1. Feishu delivers a subscribed event to this service.
2. FCoding validates and normalizes the event.
3. FCoding extracts a Codex prompt from the message.
4. FCoding handles built-in commands locally, or acknowledges a Codex task quickly.
5. Runtime state can override workspace and model behavior.
6. Codex runs locally in the selected workspace.
7. The bot replies with interactive progress/result cards; running task cards can cancel active Codex processes.

The default runtime is Feishu long connection through `@larksuiteoapi/node-sdk`. HTTP webhook mode is still available for deployments with a public HTTPS callback URL.

## Runtime Entry Points

- `src/index.js`
  - Loads `.env`.
  - Calls `loadConfig()`.
  - Creates `FeishuClient`.
  - Starts either long connection mode or HTTP mode.
  - Handles SIGINT/SIGTERM shutdown.

- `src/config.js`
  - Parses environment variables.
  - Owns defaults for Codex command, args, timeout, output limits, and Feishu mode.

- `src/commands.js`
  - Handles built-in bot commands before Codex is invoked.
  - Current commands include help, status, workspace, model, login status, and cancel.

- `src/runtime-state.js`
  - Stores process-local workspace/model overrides.
  - Stores active task cancellation state while Codex processes are running.
  - Stores temporary card state for output expand/collapse actions.
  - Builds final Codex run options from base config plus runtime overrides.

- `src/dotenv.js`
  - Lightweight local `.env` loader.
  - Does not overwrite variables already exported by the shell.

## Feishu Layer

- `src/feishu/client.js`
  - Fetches and caches tenant access tokens.
  - Sends text replies.
  - Sends interactive card replies.
  - Updates existing interactive card messages.
  - Splits long replies where needed.

- `src/feishu/events.js`
  - Parses Feishu payloads.
  - Handles URL verification payloads.
  - Extracts text messages.
  - Strips Feishu mention markup.
  - Applies allowlists and `BOT_TRIGGER_PREFIX`.
  - Deduplicates event IDs.

- `src/feishu/crypto.js`
  - Verifies HTTP callback signatures.
  - Decrypts encrypted Feishu callback payloads.
  - Mostly relevant to HTTP webhook mode.

- `src/feishu/cards.js`
  - Builds callback test cards, command result cards, status cards, running task cards with Cancel buttons, and task result cards with output expand/collapse buttons.

- `src/feishu/ws.js`
  - Starts the official Feishu `WSClient`.
  - Creates the normal `EventDispatcher`.
  - Creates a `CardActionHandler` for card callbacks.
  - Routes `im.message.receive_v1` to Codex task processing.
  - Routes `card.action.trigger` to card action handling, including output expand/collapse and cancel callbacks.
  - Patches the SDK client to dispatch websocket frames with `type=card`, because the installed Node SDK only dispatches normal event frames by default.

## HTTP Mode

- `src/server.js`
  - Creates the HTTP server.
  - Exposes `GET /healthz`.
  - Handles `POST <FEISHU_CALLBACK_PATH>`.
  - Verifies/decrypts Feishu HTTP callbacks when configured.
  - Sends quick HTTP responses and runs Codex asynchronously.

HTTP mode is optional. The default user journey should use long connection because it avoids public HTTPS setup.

## Codex Layer

- `src/codex/runner.js`
  - Spawns the configured Codex command.
  - Appends the extracted prompt.
  - Captures stdout/stderr.
  - Accepts `AbortSignal` cancellation and terminates the child process.
  - Enforces timeout.
  - Formats results for Feishu replies.
  - Truncates large output from the middle.

Default command shape:

```text
codex exec --skip-git-repo-check --sandbox workspace-write <prompt>
```

Do not reintroduce unsupported flags such as `--ask-for-approval` unless the installed Codex CLI supports them. Check `codex exec --help` before changing defaults.

Runtime state may append:

- `-m <model>` when `codex model set <name>` was used.

FCoding intentionally does not support API-key login mode. It uses the local Codex ChatGPT login for all runs.

## Built-In Bot Commands

After `BOT_TRIGGER_PREFIX` is stripped, these prompts are handled before Codex execution:

```text
help
status
workspace
workspace set <path>
workspace reset
model
model set <name>
model clear
login
login status
login use chatgpt
cancel
```

With the default prefix, users send messages such as `codex status` or `codex workspace set /repo`.

Command behavior lives in `src/commands.js`; state lives in `src/runtime-state.js`; tests live in `test/server.test.js` and `test/runtime-state.test.js`.

## Message Flow In Long Connection Mode

1. `startWsEventClient()` starts `lark.WSClient`.
2. Feishu sends subscribed events over websocket.
3. The composite dispatcher in `createWsEventDispatcher()` checks the event type.
4. `im.message.receive_v1` is normalized with `normalizeWsMessageEvent()`.
5. `extractCodexTask()` filters mentions, prefixes, allowlists, and empty prompts.
6. The handler returns quickly and schedules `processCodexTask()` with `setImmediate()`.
7. `processCodexTask()` first asks `handleBotCommand()` whether the prompt is an FCoding command.
8. For Codex tasks, `processCodexTask()` registers active task state, sends a running card with a Cancel button, starts periodic progress cards, runs Codex with an abort signal, stops progress, stores result card state, and replies with a collapsed result card.
9. `card.action.trigger` is routed to the SDK `CardActionHandler`.
10. Expand/collapse card buttons use runtime card state to rebuild task result cards; Cancel buttons abort active Codex tasks by task ID.

## Callback Test Command

The special prompt:

```text
codex cardtest
```

sends an interactive card. Clicking the button should produce logs similar to:

```text
Received Feishu WS callback
Received Feishu card action callback
```

If Feishu shows `200340`, first check Feishu subscriptions. The app must subscribe to `card.action.trigger`; a healthy long-connection socket alone is not enough.

## Test Layout

- `test/config.test.js`: config parsing.
- `test/dotenv.test.js`: local `.env` loading.
- `test/codex-runner.test.js`: Codex process execution, cancellation, and formatting.
- `test/runtime-state.test.js`: runtime workspace/model options, active task state, and card state.
- `test/feishu-client.test.js`: Feishu API client behavior.
- `test/feishu-crypto.test.js`: signature and encryption logic.
- `test/feishu-events.test.js`: event parsing, prompt extraction, allowlists, dedupe.
- `test/feishu-cards.test.js`: card payload builders.
- `test/feishu-ws.test.js`: long connection dispatch, card callbacks, SDK card-frame patch.
- `test/server.test.js`: HTTP webhook mode.

Run all tests:

```bash
npm test
```

## Development Rules For Future Agents

- Keep changes small and covered by tests.
- Preserve `.env` secrecy.
- Do not commit local runtime files such as `.env`, `.env.*`, `.codex`, or `node_modules`.
- When touching Feishu event parsing, update both long connection and HTTP tests if behavior overlaps.
- When touching Codex command execution, test success, failure, timeout, cancellation, and output truncation.
- When touching callback cards, test both payload shape and long-connection callback dispatch.
- When touching runtime commands or state, test command handling, runtime run options, and card callback behavior.
- If a behavior depends on current Feishu or Codex SDK details, inspect the installed package or official docs before changing it.

## Known Design Choices

- Event handlers return quickly to avoid Feishu callback retries.
- Codex runs asynchronously after the Feishu event is accepted.
- Long-running Codex tasks send periodic progress cards.
- Active Codex tasks can be cancelled with `codex cancel` or the running-card Cancel button.
- Built-in commands intentionally bypass Codex execution.
- Runtime state is process-local and resets on restart.
- GitHub Actions runs `npm ci` and `npm test` on push and pull request.
- The service is dependency-light and uses Node's built-in test runner.
- The app is intentionally local-first; production hardening should focus on process supervision, allowlists, and workspace isolation.
