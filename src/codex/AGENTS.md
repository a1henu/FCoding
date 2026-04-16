# src/codex AGENTS.md

## Responsibility

This directory owns the boundary between FCoding and the local Codex CLI process.

## Key Entry File

- `runner.js`: spawns Codex with stdin ignored, appends the prompt, captures stdout/stderr, keeps full output for paginated cards, handles abort cancellation, enforces timeout, truncates preview output, and formats final Feishu reply text.

## Internal Dependencies

- Called from `src/server.js#processCodexTask`.
- Indirectly used by long connection mode through `src/feishu/ws.js`, which schedules `processCodexTask`.
- Config values come from `src/config.js` under `config.codex`.
- Runtime overrides come from `src/runtime-state.js`, which can change `cwd` and append model args. FCoding uses the local Codex ChatGPT login, not API-key provider injection.

## Safer Changes

- Adjusting output formatting when tests cover success, failure, truncation, and full-output preservation.
- Adding structured result fields while preserving existing callers.
- Adding more timeout/cancellation/truncation tests.
- Adding support for runtime options if `test/runtime-state.test.js` and `test/codex-runner.test.js` cover the contract.

## High-Risk Changes

- Changing `spawn` options; shell execution is currently disabled with `shell: false`.
- Changing stdin handling; Codex CLI waits for extra piped input if stdin is left open.
- Changing argument order; current contract is `[...CODEX_ARGS, prompt]`.
- Changing how runtime-state appends `-m` model args; this affects real Codex invocation.
- Changing timeout kill behavior; current flow sends `SIGTERM` then `SIGKILL` after 5 seconds.
- Changing abort cancellation behavior; running cards and `codex cancel` depend on the runner honoring `AbortSignal`.
- Adding interactive CLI handling without a clear protocol; current runner is non-interactive and returns after process close.
- Changing default Codex args without checking the installed CLI's `codex exec --help`.

## Minimum Verification

- Always run `node --test test/codex-runner.test.js`.
- If `formatCodexResult` output changes, also run `node --test test/server.test.js test/feishu-ws.test.js`.
- If env/config contract changes, run `node --test test/config.test.js`.
- If runtime overrides change, run `node --test test/runtime-state.test.js test/server.test.js`.
- Before finalizing: `npm test`.

## Read Before Editing

- `../../docs/agent-context/project-map.md`
- `../../docs/agent-context/open-questions.md`
- `../../test/codex-runner.test.js`
- `../config.js`
- `../server.js`
