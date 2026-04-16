# test AGENTS.md

## Responsibility

`test/` contains the Node built-in test suite. Tests are organized by source module and should remain fast, deterministic, and network-free.

## Key Files

- `config.test.js`: env parsing and defaults.
- `dotenv.test.js`: local `.env` loader behavior.
- `codex-runner.test.js`: child process execution, failures, timeout, truncation.
- `feishu-client.test.js`: outbound API calls with mocked fetch.
- `feishu-crypto.test.js`: HTTP callback signature/decryption.
- `feishu-events.test.js`: payload parsing, mention stripping, allowlists, dedupe.
- `feishu-cards.test.js`: interactive card payloads.
- `feishu-ws.test.js`: long connection dispatcher and card-frame patch.
- `server.test.js`: HTTP callback server behavior and shared task orchestration.

## Internal Dependencies

Tests import source modules directly. Fakes are preferred over live Feishu, live Codex, or network dependencies.

## Safer Changes

- Adding new tests adjacent to the module being changed.
- Adding fake SDK/client objects for a narrow behavior.
- Splitting a large test into clearer cases without changing assertions.

## High-Risk Changes

- Removing coverage around security boundaries: allowlists, signature verification, `.env` behavior, Codex spawn args.
- Making tests depend on local `.env`, live Feishu, live Codex auth, or network.
- Introducing long sleeps; use small timeouts and fake runners where possible.
- Loosening assertions that catch Feishu payload shape regressions.

## Minimum Verification

- For test-only changes: run the changed test file and `npm test`.
- For source changes: run targeted tests from `docs/agent-context/testing-playbook.md`, then `npm test`.
- For docs-only changes: `npm test` is still preferred before commit because this repo is small.

## Read Before Editing

- `../docs/agent-context/testing-playbook.md`
- The source module under test
- Nearby tests with existing fake patterns
