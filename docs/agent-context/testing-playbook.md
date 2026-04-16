# Testing Playbook

This project uses Node's built-in test runner. Prefer targeted tests while developing, then run `npm test` before finalizing.

## Baseline Commands

```bash
npm test
npm audit --json
git diff --check
git status --short
```

`npm audit --json` is not required for every small docs edit, but run it after dependency or package-lock changes.

GitHub Actions runs `npm ci` and `npm test` on push and pull request via `.github/workflows/test.yml`.

## Docs-Only Changes

Examples:

- README updates
- `docs/` updates
- `AGENTS.md` updates

Minimum verification:

```bash
git diff --check
npm test
```

Also verify facts against source files if the docs describe runtime behavior, env vars, Feishu subscriptions, or commands.

## Config Or Environment Changes

Examples:

- new env var
- changed default in `src/config.js`
- `.env.example` update
- setup docs update tied to config

Minimum verification:

```bash
node --test test/config.test.js test/dotenv.test.js
npm test
```

Also check:

- `.env.example` contains no real secrets.
- README and `docs/agent-installation.md` describe the new variable.
- `src/index.js` startup still works conceptually for both `ws` and `http`.

## Feishu Message Parsing And Access Control

Examples:

- changes to `extractCodexTask`
- mention stripping
- allowlist behavior
- event type support

Minimum verification:

```bash
node --test test/feishu-events.test.js test/server.test.js test/feishu-ws.test.js
npm test
```

Pay special attention to:

- non-text messages remain ignored unless intentionally supported
- unsupported event types remain safe
- empty allowlists behavior is explicit
- `BOT_TRIGGER_PREFIX` still strips only intended text

## Feishu Outbound API Client

Examples:

- tenant token cache
- reply text payload shape
- interactive card reply payload shape
- interactive card update payload shape
- error handling for Feishu API codes

Minimum verification:

```bash
node --test test/feishu-client.test.js
npm test
```

Do not use live Feishu in unit tests. Mock `fetchImpl`.

## Long Connection And Card Callbacks

Examples:

- `src/feishu/ws.js`
- `patchWsClientCardCallbacks`
- dispatcher routing
- card action handler behavior

Minimum verification:

```bash
node --test test/feishu-ws.test.js test/feishu-cards.test.js
npm test
```

Manual smoke test when `.env` is configured:

```bash
npm start
```

Then send:

```text
codex cardtest
```

Click the returned card. Expected logs include `card.action.trigger` and `Received Feishu card action callback`.

If Feishu shows `200340`, check subscription to `card.action.trigger` before changing code.

## Interactive Card Payloads

Examples:

- new status cards
- command result cards
- task result cards with output expand/collapse
- permission buttons
- choice cards
- callback values

Minimum verification:

```bash
node --test test/feishu-cards.test.js test/feishu-ws.test.js
npm test
```

Check:

- callback `value` contains enough routing info
- no secrets or full prompts are embedded unnecessarily
- repeated clicks have a defined behavior

## Codex Runner Changes

Examples:

- process spawn command/args
- timeout behavior
- stdout/stderr handling
- result formatting
- future streaming parsing

Minimum verification:

```bash
node --test test/codex-runner.test.js test/server.test.js test/feishu-ws.test.js
npm test
```

Check:

- success result
- non-zero exit
- spawn error
- timeout
- large output truncation
- prompt remains the final child process argument unless intentionally changed
- runtime-state options still append model/API provider args before the prompt

## Runtime Commands And State

Examples:

- `src/commands.js`
- `src/runtime-state.js`
- workspace/model/auth command behavior
- output card state and TTL

Minimum verification:

```bash
node --test test/runtime-state.test.js test/server.test.js test/feishu-ws.test.js
npm test
```

Check:

- built-in commands bypass Codex execution
- workspace paths are resolved and verified before switching
- model override appends expected Codex args
- API auth mode injects provider config and env key correctly
- card state can retrieve stored task output for expand/collapse

## Shared Task Orchestration

Examples:

- `processCodexTask`
- ack messages
- progress replies
- final reply wording
- command handling before Codex execution
- error reporting

Minimum verification:

```bash
node --test test/server.test.js test/feishu-ws.test.js test/codex-runner.test.js
npm test
```

Check:

- Feishu event handler returns quickly
- progress timer stops on success and failure
- failures still attempt a Feishu reply
- duplicate events do not run Codex twice
- built-in commands do not start Codex

## HTTP Webhook Mode

Examples:

- `src/server.js`
- `src/feishu/crypto.js`
- URL verification
- encrypted callback handling

Minimum verification:

```bash
node --test test/server.test.js test/feishu-crypto.test.js test/feishu-events.test.js
npm test
```

Manual check only if HTTP mode is actively used:

```bash
FEISHU_EVENT_MODE=http npm start
curl http://127.0.0.1:3000/healthz
```

## Dependency Or Build Chain Changes

Examples:

- `package.json`
- `package-lock.json`
- `.github/workflows/test.yml`
- Node version requirement
- SDK upgrade

Minimum verification:

```bash
npm install
npm test
npm audit --json
```

If upgrading `@larksuiteoapi/node-sdk`, inspect whether `patchWsClientCardCallbacks` is still needed. The patch depends on SDK internals.

For CI workflow changes, inspect the YAML and confirm it still runs `npm ci` before `npm test` unless intentionally changing the workflow contract.
