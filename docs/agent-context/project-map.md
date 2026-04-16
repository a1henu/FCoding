# Project Map

## Architecture At A Glance

FCoding is a local Node.js ESM service with two inbound Feishu modes and one outbound Codex execution path.

Default path:

```text
Feishu long connection
  -> src/feishu/ws.js
  -> src/feishu/events.js
  -> src/server.js#processCodexTask
  -> src/commands.js or src/runtime-state.js when prompt is a built-in command
  -> src/codex/runner.js
  -> src/feishu/client.js
  -> Feishu message reply API
```

Optional HTTP path:

```text
POST /feishu/events
  -> src/server.js
  -> src/feishu/crypto.js
  -> src/feishu/events.js
  -> src/server.js#processCodexTask
  -> src/codex/runner.js
  -> src/feishu/client.js
```

The two inbound modes share event parsing and Codex task processing, but WS mode has additional long-connection dispatch logic and card callback handling.

## Runtime Startup

`src/index.js` is the process entry:

1. `loadDotEnv()` loads local `.env` without overwriting exported shell env.
2. `loadConfig()` parses env vars and defaults.
3. `new FeishuClient(config.feishu)` prepares outbound Feishu calls.
4. `createRuntimeState({ config })` creates in-memory workspace/model/card state for this process.
5. `FEISHU_EVENT_MODE=ws` starts `startWsEventClient()`.
6. `FEISHU_EVENT_MODE=http` starts `createServer()`.
7. SIGINT/SIGTERM closes the WS client or HTTP server.

Any change to startup must preserve both modes unless intentionally removing one.

## Feishu Message Data Flow

### Long Connection

`src/feishu/ws.js` builds a composite dispatcher:

- `EventDispatcher` handles normal events such as `im.message.receive_v1`.
- `CardActionHandler` handles interactive card callbacks.
- `patchWsClientCardCallbacks()` patches the installed SDK client so websocket frames with header `type=card` are dispatched instead of ignored.

For normal messages:

1. Feishu SDK receives a subscribed event.
2. `createWsEventDispatcher().invoke()` sees event type `im.message.receive_v1`.
3. `normalizeWsMessageEvent()` converts SDK data into the shape used by `extractCodexTask()`.
4. `EventDeduper` drops duplicate event IDs.
5. `extractCodexTask()` rejects unsupported messages, disallowed senders/chats, missing trigger prefix, and empty prompts.
6. The handler schedules `processCodexTask()` with `setImmediate()`.

For card callbacks:

1. Feishu sends `card.action.trigger` only if the app subscribed to that callback.
2. The dispatcher routes card payloads to `CardActionHandler`.
3. `createCardActionTriggerHandler()` reads `data.action.value`.
4. `callback_test` returns a card from `buildCallbackReceivedCard()`.
5. `expand_output` and `collapse_output` load a stored `task_result` card state from `runtimeState` and rebuild the task status card.
6. `cancel_task` cancels an active Codex task by task ID through `runtimeState.cancelActiveTask()`.

Important coupling: card callback smoke tests depend on `src/feishu/cards.js`, `src/feishu/ws.js`, Feishu console subscription to `card.action.trigger`, and the SDK patch for `type=card` frames.

### HTTP Webhook

`src/server.js` owns HTTP mode:

1. `readRequestBody()` reads bounded request bodies.
2. `parseIncomingFeishuBody()` verifies signature if enabled and decrypts encrypted payloads.
3. `parseFeishuPayload()` handles URL verification and message events.
4. Dedupe and `extractCodexTask()` mirror the WS path.
5. The HTTP response is sent before Codex work starts.

HTTP mode is not the default, but tests cover URL verification, dedupe, and signature rejection.

## Codex Task Data Flow

`processCodexTask()` in `src/server.js` is shared by both inbound modes:

1. Calls `handleBotCommand()` before running Codex.
2. If a built-in command is handled, sends that command's result card and returns.
3. Otherwise registers the task in runtime state with an `AbortController`.
4. Sends a running interactive card with a Cancel button when `FEISHU_SEND_ACK=true`.
5. Starts periodic progress cards through `startProgressReplies()`.
6. Calls the configured Codex runner with `runtimeState.buildCodexRunOptions(config.codex)` plus `signal`.
7. Stops progress replies and removes active task state.
8. Stores final task output in runtime card state and sends a collapsed task status card.
9. On pre-completion errors, tries to report failure with an interactive card.

`src/codex/runner.js` executes the external process:

- command defaults to `codex`
- args default to `exec --skip-git-repo-check --sandbox workspace-write`
- prompt is appended as the final argument
- runtime state may override `cwd` or append `-m <model>`
- `shell: false`
- timeout sends SIGTERM, then SIGKILL after 5 seconds
- cancellation through `AbortSignal` sends SIGTERM, then SIGKILL after 5 seconds
- combined stdout/stderr is truncated from the middle

## Module Relationships

- `commands.js` handles built-in runtime commands before Codex is invoked.
- `runtime-state.js` stores in-memory workspace/model settings, active task cancellation state, and temporary card state.
- `config.js` influences almost every runtime module. It is the only place env defaults should be introduced.
- `events.js` is the security gate for who can run Codex.
- `server.js` is both HTTP runtime and shared task orchestrator.
- `ws.js` imports from `server.js`, so changes to server exports can break WS mode.
- `client.js` is the only module that should know Feishu reply API paths and tenant token caching.
- `runner.js` is the only module that should spawn Codex.

## Coupling Points That Are Easy To Break

- `extractCodexTask()` expects text message payloads with `message.message_type === 'text'` and JSON content containing `text`.
- Empty allowlists currently mean "allow all" for that identifier type.
- `BOT_TRIGGER_PREFIX=codex` strips exactly the prefix after mentions are removed.
- Current task orchestration now primarily uses `replyInteractiveCard(messageId, card)` for ack/progress/final/error replies.
- Built-in commands use `task.prompt` after `BOT_TRIGGER_PREFIX` removal, so users send `codex status` but `handleBotCommand()` receives `status`.
- `codex cancel` cancels the most recent active task; running-card Cancel buttons cancel by task ID through `card.action.trigger`.
- `replyInteractiveCard()` sends `msg_type: interactive` and `content: JSON.stringify(card)`.
- `updateInteractiveCard()` sends `PATCH /im/v1/messages/:message_id`; it is implemented and tested, but current expand/collapse callbacks return replacement cards through callback response rather than calling the client method.
- Runtime card state and active task state are in memory. Restarting the process invalidates old output expand/collapse cards and removes the ability to cancel already-spawned tasks through FCoding state.
- `patchWsClientCardCallbacks()` relies on installed SDK internals: `wsClient.handleEventData`, `wsClient.dataCache.mergeData`, `wsClient.eventDispatcher`, and `wsClient.sendMessage`.
- Feishu card callbacks require console subscription to `card.action.trigger`. A healthy long-connection socket is not sufficient.

## Task Entry Points

- Add or change env var: start in `src/config.js`, update `.env.example`, README, agent docs, and `test/config.test.js`.
- Change Feishu message parsing: start in `src/feishu/events.js`, then `test/feishu-events.test.js`, `test/server.test.js`, and `test/feishu-ws.test.js`.
- Change Feishu outbound reply behavior: start in `src/feishu/client.js`, then `test/feishu-client.test.js`.
- Change long connection/card callbacks: start in `src/feishu/ws.js`, `src/feishu/cards.js`, `test/feishu-ws.test.js`, and `test/feishu-cards.test.js`.
- Change built-in commands: start in `src/commands.js`, `src/runtime-state.js`, `src/server.js`, `test/runtime-state.test.js`, and `test/server.test.js`.
- Change task cancellation: start in `src/server.js`, `src/runtime-state.js`, `src/codex/runner.js`, `src/feishu/ws.js`, and card tests.
- Change Codex execution: start in `src/codex/runner.js`, then `test/codex-runner.test.js`.
- Change progress/ack/final reply orchestration: start in `src/server.js`, then `test/server.test.js` and `test/feishu-ws.test.js`.
- Change CI: start in `.github/workflows/test.yml`, then verify with `npm test` locally and inspect `package.json` scripts.
- Change installation docs: start in `README.md`, `docs/agent-installation.md`, `.env.example`, and `src/config.js`.
