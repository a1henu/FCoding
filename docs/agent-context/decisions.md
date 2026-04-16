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

Reason: Feishu app credentials and local runtime settings are sensitive and environment-specific. API-mode secrets may be isolated into `.env.api`.

Evidence: `.gitignore` ignores `.env`, `.env.*`, and `.env.api`; `.env.example` is tracked as safe template; `src/index.js` loads `.env` and `.env.api` at startup.

Implication: Agents must never commit real `.env`/`.env.api` values or print app/API secrets.

## API-Mode Runtime Defaults Can Come From `.env.api`

Status: decided

Reason: Phone-driven API mode needs the service process to already have an API key and provider defaults available before Feishu commands switch auth mode.

Evidence: `src/index.js` loads `.env.api`; `src/runtime-state.js` reads `FCODING_AUTH_MODE`, `FCODING_MODEL`, `FCODING_API_BASE_URL`, and `FCODING_API_KEY_ENV_VAR`.

Implication: `.env.api` is the preferred local file for API keys and API-mode startup defaults. Restarting the service reloads these defaults, while in-memory command changes still reset on restart.

## Empty Allowlists Mean Allow All For That Identifier Type

Status: inferred

Reason: `isAllowed(value, allowedValues)` returns true when `allowedValues.length === 0`.

Evidence: `src/feishu/events.js`.

Implication: Production deployments should set at least one allowlist. Changing this behavior is a breaking access-control change requiring docs and tests.

## Codex Runner Is Non-Interactive

Status: decided by current implementation

Reason: `runCodexTask()` spawns a child process, captures stdout/stderr, and resolves only on process close/error/timeout. Runtime commands can alter options before the run, but the runner still does not parse streaming JSON events or write to stdin.

Evidence: `src/codex/runner.js`.

Implication: Feishu choice/permission interactions require a new protocol or a different Codex integration path; do not bolt UI cards onto the current runner without designing the process interaction.

## Built-In Commands Are Handled Before Codex

Status: decided by current implementation

Reason: `processCodexTask()` calls `handleBotCommand()` before ack/progress/Codex execution.

Evidence: `src/server.js`, `src/commands.js`, `test/server.test.js`.

Implication: User messages such as `codex status` do not run Codex. Command names are part of the user-facing protocol and need tests/docs when changed.

## Runtime State Is In Memory

Status: decided by current implementation

Reason: `createRuntimeState()` stores workspace/model/auth overrides and card state in process memory, seeded from environment where configured.

Evidence: `src/runtime-state.js`, `test/runtime-state.test.js`.

Implication: Restarting the service resets workspace/model/auth overrides and invalidates old expand/collapse output cards. This is acceptable for the current local-first design but must be revisited for durable multi-user sessions.

## Codex Prompt Is Appended As Final Argument

Status: decided by current implementation

Reason: `childArgs = [...args, prompt]`.

Evidence: `src/codex/runner.js`; `test/codex-runner.test.js`.

Implication: `CODEX_ARGS` should contain flags before the prompt. Changing order can break Codex CLI invocation.

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
