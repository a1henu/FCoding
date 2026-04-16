# Decisions

## Long Connection Is The Default Inbound Mode

Status: decided

Reason: The target user does not have a public HTTPS service. Feishu long connection works from a local machine with outbound internet access.

Evidence: `FEISHU_EVENT_MODE=ws` is the `.env.example` default; `README.md` presents long connection as the default; `src/index.js` supports `ws` and `http`.

Implication: New setup docs and default tests should prioritize WS mode. HTTP mode should remain tested but not drive the user onboarding path.

## HTTP Webhook Mode Remains Supported

Status: decided

Reason: Existing code and tests support URL verification, signature verification, encrypted payloads, and HTTP callback handling.

Evidence: `src/server.js`, `src/feishu/crypto.js`, and `test/server.test.js`.

Implication: Shared parsing changes must not silently break HTTP mode.

## `.env` Is The Local Secret Boundary

Status: decided

Reason: Feishu app credentials and local runtime settings are sensitive and environment-specific.

Evidence: `.gitignore` ignores `.env` and `.env.*`; `.env.example` is tracked as safe template; `src/index.js` loads `.env` at startup.

Implication: Agents must never commit real `.env` values or print app secrets.

## Empty Allowlists Mean Allow All For That Identifier Type

Status: inferred

Reason: `isAllowed(value, allowedValues)` returns true when `allowedValues.length === 0`.

Evidence: `src/feishu/events.js`.

Implication: Production deployments should set at least one allowlist. Changing this behavior is a breaking access-control change requiring docs and tests.

## Codex Runner Is Non-Interactive

Status: decided by current implementation

Reason: `runCodexTask()` spawns a child process, captures stdout/stderr, and resolves only on process close/error/timeout/cancellation. Runtime commands can alter options before the run, but the runner still does not parse streaming JSON events or write to stdin.

Evidence: `src/codex/runner.js`.

Implication: Feishu choice/permission interactions require a new protocol or a different Codex integration path; do not bolt UI cards onto the current runner without designing the process interaction.

## Active Task Cancellation Uses AbortSignal

Status: decided by current implementation

Reason: `processCodexTask()` registers each running Codex task in `runtimeState` with an `AbortController`; `runCodexTask()` accepts `signal` and kills the child process when aborted.

Evidence: `src/server.js`, `src/runtime-state.js`, `src/codex/runner.js`, `src/feishu/ws.js`, `test/server.test.js`, `test/codex-runner.test.js`.

Implication: `codex cancel` cancels the most recent active task, while running-card Cancel buttons cancel by task ID. Future multi-user/session work must avoid cross-user cancellation mistakes.

## Built-In Commands Are Handled Before Codex

Status: decided by current implementation

Reason: `processCodexTask()` calls `handleBotCommand()` before ack/progress/Codex execution.

Evidence: `src/server.js`, `src/commands.js`, `test/server.test.js`.

Implication: User messages such as `codex status` do not run Codex. Command names are part of the user-facing protocol and need tests/docs when changed.

## Model Selection Uses A Feishu Card

Status: decided by current implementation

Reason: Users may not know valid model names. `codex model` now returns a selection card backed by `MODEL_CHOICES`, while `codex model set <name>` remains available for custom model IDs.

Evidence: `src/commands.js#MODEL_CHOICES`, `src/feishu/cards.js#buildModelSelectionCard`, `src/feishu/ws.js` handling `set_model`, and tests in `test/feishu-cards.test.js`, `test/feishu-ws.test.js`, and `test/server.test.js`.

Implication: The default model list is a user-facing protocol. Update docs and tests when changing choices, and keep a custom text fallback because Codex-supported models can change.

## Runtime State Is In Memory

Status: decided by current implementation

Reason: `createRuntimeState()` stores workspace/model overrides, active task entries, and card state in process memory.

Evidence: `src/runtime-state.js`, `test/runtime-state.test.js`.

Implication: Restarting the service resets workspace/model overrides and invalidates old expand/collapse output cards. This is acceptable for the current local-first design but must be revisited for durable multi-user sessions.

## Codex Prompt Is Appended As Final Argument

Status: decided by current implementation

Reason: `childArgs = [...args, prompt]`.

Evidence: `src/codex/runner.js`; `test/codex-runner.test.js`.

Implication: `CODEX_ARGS` should contain flags before the prompt. Changing order can break Codex CLI invocation.

## Codex Runner Ignores Child Stdin

Status: decided by current implementation

Reason: `codex exec` treats open piped stdin as additional prompt input and waits for EOF. FCoding never writes to child stdin, so it must be closed/ignored when spawning Codex.

Evidence: `src/codex/runner.js` sets `stdio: ['ignore', 'pipe', 'pipe']`; `test/codex-runner.test.js` covers a child command that reads stdin to EOF.

Implication: Do not remove stdin ignore unless replacing the runner with an explicit streaming protocol that owns stdin writes and EOF behavior.

## Full Codex Output Is Stored For Paginated Cards

Status: decided by current implementation

Reason: Feishu cards cannot safely display arbitrarily long output in one callback response, and truncating `result.output` made Show output lose content.

Evidence: `src/codex/runner.js` returns `fullOutput`; `src/feishu/cards.js` paginates expanded output; `src/feishu/ws.js` passes callback `page`; tests cover full-output preservation and page navigation payloads.

Implication: `result.output` is a preview/display field and may be truncated. Use `result.fullOutput ?? result.output` for user-visible full output. Large outputs are kept in process memory until runtime card state expires.

## Unsupported Codex Approval Flag Was Removed

Status: decided

Reason: Installed `codex exec` rejected `--ask-for-approval`.

Evidence: README and docs warn to check `codex exec --help`; previous working default is `exec --skip-git-repo-check --sandbox workspace-write`.

Implication: Do not reintroduce approval flags without verifying the installed CLI.

## Feishu Card Callback Requires Explicit Subscription

Status: decided from observed behavior

Reason: Long connection can be healthy and message events can work while card clicks still fail with `200340` if `card.action.trigger` is not subscribed.

Evidence: Real local smoke test: after subscribing `card.action.trigger`, logs showed `eventType: 'card.action.trigger'` and card action values.

Implication: Setup docs must always include `card.action.trigger` for interactive features.

## Installed Feishu SDK Needed A Card Frame Patch

Status: inferred from installed SDK and tests

Reason: The installed SDK's `WSClient.handleEventData` only dispatches frames where header `type` is `event`. Card callback frames can arrive with `type=card`.

Evidence: `src/feishu/ws.js#patchWsClientCardCallbacks`; `test/feishu-ws.test.js` covers card frames.

Implication: Treat the patch as high-risk. Revisit it when upgrading `@larksuiteoapi/node-sdk`.

## Event Handlers Should Return Quickly

Status: decided

Reason: Feishu callbacks can retry or show user-facing errors when handlers block. Codex tasks can run much longer than callback windows.

Evidence: WS path uses `setImmediate()` before `processCodexTask`; HTTP path sends response before scheduling Codex.

Implication: Do not await long Codex runs inside Feishu event callback handlers.

## CI Runs The Test Suite On Push And Pull Request

Status: decided

Reason: `.github/workflows/test.yml` uses `actions/checkout@v4`, `actions/setup-node@v4` with Node 20 and npm cache, `npm ci`, and `npm test`.

Evidence: `.github/workflows/test.yml`.

Implication: Keep `package-lock.json` committed and keep `npm test` as the authoritative test command unless the workflow is updated.

## Tests Use Node's Built-In Test Runner

Status: decided

Reason: `package.json` script is `node --test`; tests use `node:test` and `node:assert/strict`.

Evidence: all files in `test/`.

Implication: Avoid introducing a new test framework unless there is a strong reason.
